import type { Prisma, RolUsuario } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { hashPassword } from "../lib/password.js";
import { runInTransaction, USUARIOS_TRANSACTION_BOUNDS } from "../lib/prisma.js";
import * as leadRepository from "../repositories/lead.repository.js";
import type { PoolAsignacion } from "../repositories/lead.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";
import type {
  AdminUsuarioView,
  ResponsableView,
  UpdateUsuarioData,
} from "../repositories/usuario.repository.js";
import type { ListUsuariosQuery } from "../schemas/usuarios.schema.js";
import { applyAsignacion, chooseCandidato, type CandidatoAsignacion } from "./asignacion.service.js";
import { publishCommittedEvents, type CommittedEvent } from "./committed-events.service.js";
import { scheduleMetricasBroadcast } from "../lib/metricas-broadcast.js";

function userNotFound(): AppError {
  return new AppError("usuario_no_encontrado", 404, "Usuario no encontrado");
}

function emailAlreadyInUse(): AppError {
  return new AppError("correo_en_uso", 409, "El correo ya está en uso");
}

/**
 * M2 (baja lógica con reasignación obligatoria de cartera activa): 409
 * accionable — "obligatoria" es bloqueante. Si el usuario a dar de baja tiene
 * cartera abierta y no hay NINGÚN otro candidato activo del mismo pool para
 * recibirla, la baja se rechaza entera (nada se persiste, ver
 * `deactivateUsuario` abajo) en vez de dejar leads huérfanos.
 */
function noHayCandidatoParaReasignar(): AppError {
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
const POOL_POR_ROL: Partial<Record<RolUsuario, PoolAsignacion>> = {
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
}

export interface UpdateUsuarioInput {
  nombre?: string;
  correo?: string;
  password?: string;
  rol?: RolUsuario;
}

/** Alta de usuario (D9: solo `ADMINISTRADOR` llega hasta acá vía `requireRole`). */
export async function createUsuario(input: CreateUsuarioInput): Promise<AdminUsuarioView> {
  const passwordHash = await hashPassword(input.password);

  try {
    return await usuarioRepository.createUsuario({
      nombre: input.nombre,
      correo: input.correo,
      passwordHash,
      rol: input.rol,
    });
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

export async function updateUsuario(id: string, input: UpdateUsuarioInput): Promise<AdminUsuarioView> {
  const data: UpdateUsuarioData = {
    nombre: input.nombre,
    correo: input.correo,
    rol: input.rol,
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
      const pool = POOL_POR_ROL[usuario.rol];

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
            throw noHayCandidatoParaReasignar();
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

          for (const lead of cartera) {
            const candidato = chooseCandidato(candidatos);
            if (candidato === null) {
              // Inalcanzable: `candidatos` nunca queda vacío dentro de este
              // loop (solo se incrementa `cargaActiva`, nunca se remueve un
              // elemento) — defensivo, no reemplaza la guarda de arriba.
              throw noHayCandidatoParaReasignar();
            }

            const responsableAnteriorId = pool === "ASESOR" ? lead.asesorId : lead.vendedorId;
            const resultado = await applyAsignacion(
              {
                leadId: lead.id,
                pool,
                receptorId: candidato.id,
                responsableAnteriorId,
                tipoEvento: pool === "ASESOR" ? "REASIGNACION" : "TRASPASO",
                motivo: "baja_usuario",
                ejecutadoPorId: null,
                ahora,
              },
              tx,
            );
            eventosAcumulados.push(...resultado.events);

            // Mantener el estado en memoria en sincronía con lo que
            // `applyAsignacion` ya persistió (`cargaActiva` +1,
            // `ultimaAsignacionEn = ahora`) para que el próximo lead de esta
            // misma cartera compare contra la carga actualizada.
            candidato.cargaActiva += 1;
            candidato.ultimaAsignacionEn = ahora;
          }
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
