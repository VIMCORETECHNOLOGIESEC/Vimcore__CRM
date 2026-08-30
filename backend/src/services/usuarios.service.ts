import type { Prisma, RolUsuario } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { hashPassword } from "../lib/password.js";
import { runInTransaction, USUARIOS_TRANSACTION_BOUNDS, type PrismaClientOrTransaction } from "../lib/prisma.js";
import * as leadRepository from "../repositories/lead.repository.js";
import type { PoolAsignacion } from "../repositories/lead.repository.js";
import * as membresiaRepository from "../repositories/membresia.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";
import type {
  AdminUsuarioView,
  ResponsableView,
  UpdateUsuarioData,
} from "../repositories/usuario.repository.js";
import type { ListResponsablesQuery, ListUsuariosQuery } from "../schemas/usuarios.schema.js";
import type { AuthenticatedUser } from "../types/authenticated-user.js";
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
  // Bloque C follow-up (D2 gap closure) + fix (bug de seguridad, empresaId
  // forzado por sesión): opcional en el tipo -- `resolveEmpresaId` abajo
  // decide si hace falta y de dónde sale, según el actor. El schema Zod de la
  // capa HTTP ya no reaplica esta validación condicional (movida acá).
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
 * Fix (bug de seguridad: POST /usuarios no forzaba `empresaId` a la empresa
 * del actor): mismo criterio/mismo error que `negociacion/producto.service.ts
 * ::resolveEmpresaId` -- una sesión company-scoped nunca puede elegir su
 * empresa por body (anti-escalamiento); una sesión holding-wide (D2) no tiene
 * una empresa de sesión de la que derivarlo, así que el body debe traerla
 * explícita. Replicado acá en vez de importado (mismo criterio de
 * duplicación deliberada que `ROLES_ACCESO_TOTAL` de arriba, ya documentado
 * como divergencia intencional entre archivos de este codebase).
 */
function resolveEmpresaId(actor: AuthenticatedUser, empresaIdBody: string | undefined): string {
  if (actor.empresaId !== null) return actor.empresaId;
  if (!empresaIdBody) {
    throw new AppError(
      "empresa_requerida",
      400,
      "Debes indicar empresaId explícitamente para una sesión holding-wide",
    );
  }
  return empresaIdBody;
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
 * así que una `Membresia` para ellos nunca se leería -- `resolveEmpresaId` ni
 * siquiera se invoca para estos dos roles.
 *
 * Fix (bug de seguridad): `empresaId` para ASESOR/VENDEDOR ya NO sale directo
 * del body -- `resolveEmpresaId(actor, input.empresaId)` fuerza la empresa
 * del actor si es company-scoped (el body se ignora), o exige que el body la
 * traiga explícita si el actor es holding-wide (400 `empresa_requerida`).
 */
export async function createUsuario(
  actor: AuthenticatedUser,
  input: CreateUsuarioInput,
): Promise<AdminUsuarioView> {
  const empresaId = ROLES_ACCESO_TOTAL.includes(input.rol)
    ? undefined
    : resolveEmpresaId(actor, input.empresaId);

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

        if (empresaId !== undefined) {
          const { rol, habilitadoParaVenta } = membresiaParaRolLegado(
            input.rol as "ASESOR" | "VENDEDOR",
          );
          await membresiaRepository.createMembresia(
            {
              usuarioId: usuario.id,
              empresaId,
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
 * Fix (bug de seguridad: GET/PATCH/DELETE /usuarios no filtraban por
 * empresa): mismo criterio D2 que `negociacion/producto.service.ts::
 * listarProductos` -- `empresaId === null` en el actor es holding-wide (sin
 * restricción, D2); cualquier otro valor exige que el `Usuario` objetivo
 * tenga AL MENOS una `Membresia` en esa empresa exacta (`Usuario` no tiene
 * columna `empresaId` propia, a diferencia de `Bridge`/`Lead` --
 * `usuarioRepository.existsEnEmpresa`, único punto de verdad de ese chequeo).
 * Un actor de empresa nunca ve ni un usuario de otra empresa NI a
 * ADMINISTRADOR/SUPERVISOR/SUPERVISOR_HOLDING/SUPER_ADMIN holding-wide (sin
 * `Membresia` propia): quedan fuera del `some` por no tener ninguna fila de
 * `Membresia`.
 */
async function assertUsuarioEnAlcance(
  actor: AuthenticatedUser,
  targetId: string,
  client?: PrismaClientOrTransaction,
): Promise<void> {
  if (actor.empresaId === null) return;
  const pertenece = await usuarioRepository.existsEnEmpresa(targetId, actor.empresaId, client);
  if (!pertenece) {
    throw userNotFound();
  }
}

/**
 * F7 (admin de usuarios): mismo patrón de `leads.service.ts::buildWhere` +
 * `findLeads` — `where` armado acá, paginación/orden resueltos por el
 * repositorio con `skip`/`take`/`count` en paralelo.
 */
function buildWhere(query: ListUsuariosQuery, actor: AuthenticatedUser): Prisma.UsuarioWhereInput {
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

  // Fix (bug de seguridad): mismo criterio de 3 ramas que
  // `negociacion/producto.service.ts::listarProductos` -- (1) company-scoped:
  // forzado a su propia empresa vía `Membresia`, el query param se ignora
  // (anti-escalamiento, `assertUsuarioEnAlcance` arriba aplica el mismo
  // criterio por id); (2) holding-wide con `query.empresaId`: drill-down
  // opcional a UNA empresa puntual (`EmpresaDetallePage`); (3) holding-wide
  // sin `query.empresaId`: sin filtro, ve todo (D2). `activa: true` en ambas
  // ramas (fix, decisión de equipo): una `Membresia` desactivada saca al
  // usuario del alcance administrativo de esa empresa, mismo criterio que
  // `usuarioRepository.existsEnEmpresa`.
  if (actor.empresaId !== null) {
    where.membresias = { some: { empresaId: actor.empresaId, activa: true } };
  } else if (query.empresaId) {
    where.membresias = { some: { empresaId: query.empresaId, activa: true } };
  }

  return where;
}

export async function findUsuarios(actor: AuthenticatedUser, query: ListUsuariosQuery): Promise<FindUsuariosResult> {
  const where = buildWhere(query, actor);

  const { usuarios, total } = await usuarioRepository.findUsuarios(where, {
    skip: (query.pagina - 1) * query.limite,
    take: query.limite,
    orderBy: { creadoEn: query.direccion },
  });

  return { usuarios, total, pagina: query.pagina, limite: query.limite };
}

export async function findUsuarioById(actor: AuthenticatedUser, id: string): Promise<AdminUsuarioView> {
  await assertUsuarioEnAlcance(actor, id);
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
export async function updateUsuario(
  actor: AuthenticatedUser,
  id: string,
  input: UpdateUsuarioInput,
): Promise<AdminUsuarioView> {
  await assertUsuarioEnAlcance(actor, id);
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
 *
 * Fix (bug de seguridad, scope por empresa): mismo criterio de 3 ramas que
 * `buildWhere` arriba -- (1) company-scoped: forzado a su propia empresa, el
 * query param se ignora (anti-escalamiento); (2) holding-wide con
 * `query.empresaId`: drill-down opcional a UNA empresa puntual; (3)
 * holding-wide sin `query.empresaId`: sin filtro, ve responsables de
 * cualquier empresa (D2).
 */
export async function findResponsables(
  actor: AuthenticatedUser,
  query: ListResponsablesQuery,
): Promise<ResponsableView[]> {
  let empresaId: string | undefined;
  if (actor.empresaId !== null) {
    empresaId = actor.empresaId;
  } else if (query.empresaId) {
    empresaId = query.empresaId;
  }

  return usuarioRepository.findResponsablesActivosPorRol(query.rol, empresaId);
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
export async function deactivateUsuario(actor: AuthenticatedUser, id: string): Promise<void> {
  const events = await runInTransaction(
    undefined,
    async (tx) => {
      // Fix (bug de seguridad): chequeo de alcance DENTRO de la misma tx que
      // el resto de la baja -- mismo criterio que `assertUsuarioEnAlcance`,
      // reusado con el cliente de transacción para ver el mismo snapshot.
      await assertUsuarioEnAlcance(actor, id, tx);
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
