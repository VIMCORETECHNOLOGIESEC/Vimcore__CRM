import type { Prisma, RolUsuario } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { hashPassword } from "../lib/password.js";
import { runInTransaction, USUARIOS_TRANSACTION_BOUNDS } from "../lib/prisma.js";
import * as leadRepository from "../repositories/lead.repository.js";
import type { PoolAsignacion } from "../repositories/lead.repository.js";
import * as membresiaRepository from "../repositories/membresia.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";
import type {
  AdminUsuarioView,
  ResponsableView,
  UpdateUsuarioData,
} from "../repositories/usuario.repository.js";
import type { ListUsuariosQuery } from "../schemas/usuarios.schema.js";
import {
  applyAsignacionesEnLote,
  chooseCandidato,
  type ApplyAsignacionesEnLoteInput,
  type CandidatoAsignacion,
} from "./asignacion.service.js";
import { publishCommittedEvents, type CommittedEvent } from "./committed-events.service.js";
import { scheduleMetricasBroadcast } from "../lib/metricas-broadcast.js";

function userNotFound(): AppError {
  return new AppError("usuario_no_encontrado", 404, "Usuario no encontrado");
}

function emailAlreadyInUse(): AppError {
  return new AppError("correo_en_uso", 409, "El correo ya está en uso");
}

/**
 * Bloque C follow-up (D2 gap closure, spec "Request-scoped tenant context"):
 * `empresaId` es obligatorio al crear un `ASESOR`/`VENDEDOR` — son los únicos
 * roles legado cuyo `TenantContext` se resuelve vía `Membresia`
 * (`require-authentication.middleware.ts::resolverEmpresaId`,
 * `ROLES_ACCESO_TOTAL` excluye a estos dos). Sin esto, el usuario nuevo
 * nacería sin `Membresia` y su `TenantContext` sería irresoluble en el
 * primer login — el mismo hueco que esta batch cierra.
 */
function empresaIdRequerido(): AppError {
  return new AppError(
    "empresa_id_requerido",
    400,
    "empresaId es obligatorio para crear un usuario ASESOR o VENDEDOR",
  );
}

/**
 * D2: mismos dos roles holding-wide incondicionales que
 * `require-authentication.middleware.ts::ROLES_ACCESO_TOTAL` — nunca
 * resuelven `TenantContext` vía `Membresia`, así que crear una acá sería
 * muerta (nunca leída) y además violaría `@@unique([usuarioId, empresaId,
 * rol])` si el mismo admin se re-creara alguna vez en otra empresa.
 */
const ROLES_ACCESO_TOTAL: readonly RolUsuario[] = ["ADMINISTRADOR", "SUPERVISOR"];

/**
 * D2/backfill (mismo mapeo que `shadow-authorization.service.ts::
 * rolEquivalente`): `VENDEDOR` legado no tiene su propio `RolMembresia` —
 * mapea a `ASESOR` con `habilitadoParaVenta = true`; `ASESOR` legado mapea a
 * `ASESOR` con `habilitadoParaVenta = false`.
 */
function membresiaParaRolLegado(rol: "ASESOR" | "VENDEDOR"): {
  rol: "ASESOR";
  habilitadoParaVenta: boolean;
} {
  return { rol: "ASESOR", habilitadoParaVenta: rol === "VENDEDOR" };
}

/**
 * M2 (baja lógica con reasignación obligatoria de cartera activa): 409
 * accionable — "obligatoria" es bloqueante. Si el usuario a dar de baja tiene
 * cartera abierta y no hay NINGÚN otro candidato activo del mismo pool para
 * recibirla, la baja se rechaza entera (nada se persiste, ver
 * `deactivateUsuario` abajo) en vez de dejar leads huérfanos.
 */
function noCandidateToReassign(): AppError {
  return new AppError(
    "baja_sin_candidato_reasignacion",
    409,
    "No hay otro usuario activo del mismo rol para reasignar la cartera de este usuario",
  );
}

/**
 * M2: solo `ASESOR`/`VENDEDOR` tienen cartera de leads (`asesorId`/
 * `vendedorId`) — `ADMINISTRADOR`/`SUPERVISOR` nunca son responsables de un
 * lead, así que su baja nunca necesita reasignación.
 */
const POOL_BY_ROL: Partial<Record<RolUsuario, PoolAsignacion>> = {
  ASESOR: "ASESOR",
  VENDEDOR: "VENDEDOR",
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export interface CreateUsuarioInput {
  nombre: string;
  correo: string;
  password: string;
  rol: RolUsuario;
  // Bloque C follow-up (D2 gap closure): obligatorio solo para ASESOR/VENDEDOR
  // (validado en `empresaIdRequerido` abajo, no en el tipo — el schema Zod de
  // la capa HTTP hace la misma validación condicional antes de llegar acá).
  empresaId?: string;
}

export interface UpdateUsuarioInput {
  nombre?: string;
  correo?: string;
  password?: string;
  rol?: RolUsuario;
  activo?: boolean;
}

/**
 * Alta de usuario (D9: solo `ADMINISTRADOR` llega hasta acá vía
 * `requireRole`).
 *
 * Bloque C follow-up (D2 gap closure): `ASESOR`/`VENDEDOR` ahora nacen con su
 * `Membresia` (empresaId+rol) en la MISMA transacción que el `Usuario`
 * (mismo criterio atómico que `deactivateUsuario`) — cierra el hueco que
 * dejaba `TenantContext` irresoluble para todo usuario nuevo (Fase 1/Stage 1,
 * desviación documentada en `sdd/bloque-c-aislamiento/tasks`).
 * `ADMINISTRADOR`/`SUPERVISOR` siguen sin `Membresia`: resuelven
 * `empresaId: null` (holding-wide) incondicionalmente en el middleware (D2),
 * así que una `Membresia` para ellos nunca se leería.
 */
export async function createUsuario(input: CreateUsuarioInput): Promise<AdminUsuarioView> {
  if (!ROLES_ACCESO_TOTAL.includes(input.rol) && !input.empresaId) {
    throw empresaIdRequerido();
  }

  const passwordHash = await hashPassword(input.password);

  try {
    return await runInTransaction(
      undefined,
      async (tx) => {
        const usuario = await usuarioRepository.createUsuario(
          {
            nombre: input.nombre,
            correo: input.correo,
            passwordHash,
            rol: input.rol,
          },
          tx,
        );

        if (!ROLES_ACCESO_TOTAL.includes(input.rol) && input.empresaId) {
          const { rol, habilitadoParaVenta } = membresiaParaRolLegado(
            input.rol as "ASESOR" | "VENDEDOR",
          );
          await membresiaRepository.createMembresia(
            {
              usuarioId: usuario.id,
              empresaId: input.empresaId,
              rol,
              habilitadoParaVenta,
            },
            tx,
          );
        }

        return usuario;
      },
      USUARIOS_TRANSACTION_BOUNDS,
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw emailAlreadyInUse();
    }
    throw error;
  }
}

export interface FindUsuariosResult {
  usuarios: AdminUsuarioView[];
  total: number;
  pagina: number;
  limite: number;
}

/**
 * F7 (admin de usuarios): mismo patrón de `leads.service.ts::buildWhere` +
 * `findLeads` — `where` armado acá, paginación/orden resueltos por el
 * repositorio con `skip`/`take`/`count` en paralelo.
 */
function buildWhere(query: ListUsuariosQuery): Prisma.UsuarioWhereInput {
  const where: Prisma.UsuarioWhereInput = {};

  if (query.busqueda) {
    // Verificado empíricamente contra la BD de test: aunque `correo` es
    // `@db.Citext` y un `LIKE` crudo en SQL ya es insensible a mayúsculas
    // (el operador está sobrecargado por la extensión citext), el `contains`
    // de Prisma SIN `mode: "insensitive"` NO usa ese camino — devuelve 0
    // resultados con un patrón en mayúsculas. `mode: "insensitive"` es
    // obligatorio en ambos campos, no solo en `nombre`.
    where.OR = [
      { nombre: { contains: query.busqueda, mode: "insensitive" } },
      { correo: { contains: query.busqueda, mode: "insensitive" } },
    ];
  }

  if (query.rol) where.rol = query.rol;
  if (query.activo !== undefined) where.activo = query.activo;

  return where;
}

export async function findUsuarios(query: ListUsuariosQuery): Promise<FindUsuariosResult> {
  const where = buildWhere(query);

  const { usuarios, total } = await usuarioRepository.findUsuarios(where, {
    skip: (query.pagina - 1) * query.limite,
    take: query.limite,
    orderBy: { creadoEn: query.direccion },
  });

  return { usuarios, total, pagina: query.pagina, limite: query.limite };
}

export async function findUsuarioById(id: string): Promise<AdminUsuarioView> {
  const user = await usuarioRepository.findPublicById(id);
  if (!user) {
    throw userNotFound();
  }
  return user;
}

/**
 * `activo` (reactivación, mismo patrón que `bridge.service.ts::updateBridge`
 * con `estado: "ACTIVO"`): SOLO fija el flag, sin validar el estado previo —
 * reactivar a un usuario ya activo es un no-op idempotente, no un error. NO
 * restaura la cartera de leads redistribuida por `deactivateUsuario` (abajo)
 * ni reemite tokens/sesión; el usuario reactivado arranca con cartera vacía
 * y vuelve a recibir leads por asignación normal hacia adelante.
 */
export async function updateUsuario(id: string, input: UpdateUsuarioInput): Promise<AdminUsuarioView> {
  const data: UpdateUsuarioData = {
    nombre: input.nombre,
    correo: input.correo,
    rol: input.rol,
    activo: input.activo,
  };
  if (input.password) {
    data.passwordHash = await hashPassword(input.password);
  }

  try {
    const updated = await usuarioRepository.updateUsuario(id, data);
    if (!updated) {
      throw userNotFound();
    }
    return updated;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw emailAlreadyInUse();
    }
    throw error;
  }
}

/**
 * F3/F4 (diseño D-A1): catálogo de responsables activos para un pool de rol
 * — consumido por `GET /usuarios/responsables` y (indirectamente, vía el
 * frontend) por el selector de destinatario del lote de asignación.
 */
export async function findResponsables(rol: RolUsuario): Promise<ResponsableView[]> {
  return usuarioRepository.findResponsablesActivosPorRol(rol);
}

/**
 * D3 + M2 (baja lógica con reasignación obligatoria de cartera activa):
 * transaccional de punta a punta —
 *   1. lee el usuario (404 si no existe).
 *   2. si su rol tiene cartera (`ASESOR`/`VENDEDOR`) y esa cartera abierta no
 *      está vacía, resuelve los candidatos activos del pool y su carga
 *      activa con UNA sola consulta de cada una (no una por lead — hallazgo
 *      de code-review sobre N+1 dentro de esta transacción interactiva) y
 *      distribuye la cartera en memoria con el mismo criterio de desempate
 *      que `chooseCandidato` (`asignacion.service.ts`), persistiendo cada
 *      lead con `applyAsignacion` (mismo patrón que `reassignLead`/
 *      `transferLead`); sin candidato disponible, aborta con 409 y NADA se
 *      persiste (ni la baja ni ninguna reasignación parcial).
 *   3. `activo=false` + revocación de refresh tokens
 *      (`usuarioRepository.deactivateUsuario`, mismo `tx`).
 * Los eventos SSE se publican DESPUÉS del commit, igual que el resto de
 * `asignacion.service.ts`.
 */
export async function deactivateUsuario(id: string): Promise<void> {
  const events = await runInTransaction(
    undefined,
    async (tx) => {
      const usuario = await usuarioRepository.findById(id, tx);
      if (!usuario) {
        throw userNotFound();
      }

      const eventosAcumulados: CommittedEvent[] = [];
      const pool = POOL_BY_ROL[usuario.rol];

      if (pool !== undefined) {
        const ahora = new Date();
        const cartera = await leadRepository.findCarteraAbierta(id, pool, tx);

        if (cartera.length > 0) {
          // Una sola consulta de candidatos y una sola de carga activa para
          // TODA la cartera (nunca una por lead, ver hallazgo de code-review
          // sobre N+1 dentro de la transacción de baja): la distribución
          // entre candidatos ocurre en memoria reusando el mismo criterio de
          // desempate que `asignacion.service.ts::chooseCandidato`.
          const activos = await usuarioRepository.findActivosPorRol(pool, tx);
          const candidatosElegibles = activos.filter((u) => u.id !== id);

          if (candidatosElegibles.length === 0) {
            throw noCandidateToReassign();
          }

          const cargas = await leadRepository.countCargaActivaPorResponsable(
            pool,
            candidatosElegibles.map((u) => u.id),
            tx,
          );

          const candidatos: CandidatoAsignacion[] = candidatosElegibles.map((u) => ({
            id: u.id,
            ultimaAsignacionEn: u.ultimaAsignacionEn,
            cargaActiva: cargas.get(u.id) ?? 0,
          }));

          // Selección de candidato lead-por-lead en memoria (sin awaits a
          // BD dentro del loop, ver nota de code-review sobre N+1): solo la
          // ESCRITURA se agrupa por receptor y se ejecuta una única vez
          // después del loop (`applyAsignacionesEnLote`), en vez de un
          // `applyAsignacion` awaited por lead.
          const entradas: ApplyAsignacionesEnLoteInput[] = [];
          for (const lead of cartera) {
            const candidato = chooseCandidato(candidatos);
            if (candidato === null) {
              // Inalcanzable: `candidatos` nunca queda vacío dentro de este
              // loop (solo se incrementa `cargaActiva`, nunca se remueve un
              // elemento) — defensivo, no reemplaza la guarda de arriba.
              throw noCandidateToReassign();
            }

            const responsableAnteriorId = pool === "ASESOR" ? lead.asesorId : lead.vendedorId;
            entradas.push({
              leadId: lead.id,
              empresaId: lead.empresaId,
              receptorId: candidato.id,
              responsableAnteriorId,
            });

            // Mantener el estado en memoria en sincronía con lo que la
            // escritura en lote va a persistir (`cargaActiva` +1,
            // `ultimaAsignacionEn = ahora`) para que el próximo lead de esta
            // misma cartera compare contra la carga actualizada.
            candidato.cargaActiva += 1;
            candidato.ultimaAsignacionEn = ahora;
          }

          const eventos = await applyAsignacionesEnLote(
            entradas,
            {
              pool,
              tipoEvento: pool === "ASESOR" ? "REASIGNACION" : "TRASPASO",
              motivo: "baja_usuario",
              ejecutadoPorId: null,
              ahora,
            },
            tx,
          );
          eventosAcumulados.push(...eventos);
        }
      }

      await usuarioRepository.deactivateUsuario(id, tx);
      return eventosAcumulados;
    },
    USUARIOS_TRANSACTION_BOUNDS,
  );
  publishCommittedEvents(events);
  // M9 (docs/08-dashboard-kpis.md §5): post-commit, mismo lugar que
  // `publishCommittedEvents` — la `tx` de arriba (que puede haber reasignado
  // toda la cartera vía `applyAsignacion`) ya confirmó.
  scheduleMetricasBroadcast();
}
