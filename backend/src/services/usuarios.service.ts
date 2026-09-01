import { createHash, randomBytes } from "node:crypto";
import type { Prisma, RolUsuario } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { hashPassword } from "../lib/password.js";
import { runInTransaction, USUARIOS_TRANSACTION_BOUNDS, type PrismaClientOrTransaction } from "../lib/prisma.js";
import * as empresaRepository from "../repositories/empresa.repository.js";
import * as leadRepository from "../repositories/lead.repository.js";
import type { PoolAsignacion } from "../repositories/lead.repository.js";
import * as membresiaRepository from "../repositories/membresia.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";
import { DOMINIO_CORREO_PORTADOR } from "../repositories/usuario.repository.js";
import type {
  AdminUsuarioListView,
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
import { getPresenceForUsuarios, type PresenciaUsuarioView } from "./presencia.service.js";

function userNotFound(): AppError {
  return new AppError("usuario_no_encontrado", 404, "Usuario no encontrado");
}

function emailAlreadyInUse(): AppError {
  return new AppError("correo_en_uso", 409, "El correo ya está en uso");
}

function empresaNotFound(): AppError {
  return new AppError("empresa_no_encontrada", 404, "Empresa no encontrada");
}

/**
 * D2: mismos roles holding-wide incondicionales que
 * `require-authentication.middleware.ts::ROLES_ACCESO_TOTAL` — nunca
 * resuelven `TenantContext` vía `Membresia`, así que crear una acá sería
 * muerta (nunca leída) y además violaría `@@unique([usuarioId, empresaId,
 * rol])` si el mismo admin se re-creara alguna vez en otra empresa.
 *
 * Bloque F (aditivo, fix de bug real): `SUPERVISOR_HOLDING`/`SUPER_ADMIN`
 * agregados acá cierran el mismo hueco que tenían `citas.service.ts` y
 * `conversaciones.access.ts` — sin esto, `createUsuario` tomaba el camino de
 * `resolveEmpresaId` para estos dos roles y terminaba creando una
 * `Membresia(rol: ASESOR)` corrupta para un usuario que debería ser
 * holding-wide sin `Membresia` (mismo alcance máximo que
 * ADMINISTRADOR/SUPERVISOR).
 */
const ROLES_ACCESO_TOTAL: readonly RolUsuario[] = [
  "ADMINISTRADOR",
  "SUPERVISOR",
  "SUPERVISOR_HOLDING",
  "SUPER_ADMIN",
];

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
 * M2, revisado por el cutover de Bloque D (D5, docs/16 §4.2: "se elimina el
 * rol Vendedor separado — cada asesor tiene un atributo 'habilitado para
 * venta'"): los dos pools de cartera de `Lead` que `deactivateUsuario` (abajo)
 * siempre intenta reasignar. `ADMINISTRADOR`/`SUPERVISOR`/holding nunca son
 * responsables de un lead, así que ambas búsquedas de cartera dan vacío para
 * ellos sin necesidad de una gate por `Usuario.rol` previa.
 *
 * Fix (bug real, no solo drift futuro): ANTES, el pool a reasignar salía de
 * `POOL_BY_ROL[usuario.rol]` -- un mapa 1:1 sobre el enum LEGADO
 * `Usuario.rol` (`ASESOR` u `VENDEDOR` como valores separados). Eso era
 * incorrecto incluso HOY, antes de cualquier cutover de frontend: desde que
 * `asignacion.service.ts::selectResponsableEnEmpresa` resuelve el pool
 * `ASESOR` vía `Membresia(rol: ASESOR)` SIN filtrar por
 * `habilitadoParaVenta` (ver ese archivo), un asesor habilitado para venta
 * (`Usuario.rol` legado = `VENDEDOR`) es candidato válido del pool `ASESOR`
 * de asignación inicial Y del pool `VENDEDOR` de traspaso a la vez -- puede
 * terminar con cartera abierta en AMBAS columnas FK (`Lead.asesorId` para
 * leads que nunca traspasó, `Lead.vendedorId` para los que sí). El mapa viejo
 * elegía UN solo pool según el rol nominal y dejaba la cartera del otro
 * huérfana (FK apuntando a un usuario ya inactivo, sin reasignar ni
 * rechazar la baja). `findCarteraAbierta` (por columna FK real) es la fuente
 * de verdad correcta -- no hace falta consultar `Usuario.rol` ni `Membresia`
 * para decidir qué pool(s) aplican, solo para resolver los candidatos de
 * reemplazo (ver el loop en `deactivateUsuario`, ya migrado a
 * `findActivosPorRolMembresia`/`countCargaActivaPorResponsableEnEmpresa` --
 * mismas funciones que `asignacion.service.ts`, Bloque D).
 */
const POOLS_DE_CARTERA: readonly PoolAsignacion[] = ["ASESOR", "VENDEDOR"];

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

export interface CreateEmpresaAdministradorInput {
  nombre: string;
  correo: string;
  password: string;
}

export type CreateEmpresaSupervisorInput = CreateEmpresaAdministradorInput;

export type CreateEmpresaAsesorInput = CreateEmpresaAdministradorInput;

export interface EmpresaAdministradorView {
  usuario: {
    id: string;
    nombre: string;
    rol: "ADMINISTRADOR";
    activo: boolean;
  };
  membresia: {
    id: string;
    usuarioId: string;
    empresaId: string;
    rol: "ADMINISTRADOR";
    activa: boolean;
    correo: string;
  };
}

export interface EmpresaSupervisorView {
  usuario: {
    id: string;
    nombre: string;
    rol: "SUPERVISOR";
    activo: boolean;
  };
  membresia: {
    id: string;
    usuarioId: string;
    empresaId: string;
    rol: "SUPERVISOR";
    activa: boolean;
    correo: string;
  };
}

export interface EmpresaAsesorView {
  usuario: {
    id: string;
    nombre: string;
    rol: "ASESOR";
    activo: boolean;
  };
  membresia: {
    id: string;
    usuarioId: string;
    empresaId: string;
    rol: "ASESOR";
    activa: boolean;
    correo: string;
  };
}

/**
 * Hotfix (supervisor scoped a empresa): mapa de segmento de correo del
 * portador por rol -- separado del propio `RolUsuario`/`RolMembresia` porque
 * el segmento histórico de ADMINISTRADOR es `admin` (no `administrador`,
 * ver el prefijo `portador-admin-` ya persistido en BD antes de este
 * cambio) -- generalizar `correoPortadorAdministrador` sin este mapa
 * explícito habría cambiado ese prefijo ya existente.
 *
 * Fix (Asesor scoped a empresa logueaba holding-wide): agrega el segmento
 * `asesor` con el mismo criterio -- mismo mecanismo que ADMINISTRADOR/
 * SUPERVISOR arriba, sin prefijo histórico previo que preservar.
 */
const ROL_PORTADOR_SEGMENTO: Record<"ADMINISTRADOR" | "SUPERVISOR" | "ASESOR", string> = {
  ADMINISTRADOR: "admin",
  SUPERVISOR: "supervisor",
  ASESOR: "asesor",
};

function correoPortadorPara(
  rol: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR",
  empresaId: string,
  correoMembresia: string,
): string {
  const digest = createHash("sha256")
    .update(`${empresaId}:${correoMembresia.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 24);
  return `portador-${ROL_PORTADOR_SEGMENTO[rol]}-${empresaId}-${digest}@${DOMINIO_CORREO_PORTADOR}`;
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

/**
 * Provisiona un administrador company-scoped sin cambiar `POST /usuarios`:
 * el correo de login vive en `Membresia.correo`; el `Usuario` es solo el
 * portador legado requerido por la sesión y la autorización existentes.
 */
export async function createEmpresaAdministrador(
  empresaId: string,
  input: CreateEmpresaAdministradorInput,
): Promise<EmpresaAdministradorView> {
  const membresiaPasswordHash = await hashPassword(input.password);
  const usuarioPasswordHash = await hashPassword(randomBytes(32).toString("base64url"));
  const usuarioCorreo = correoPortadorPara("ADMINISTRADOR", empresaId, input.correo);

  try {
    return await runInTransaction(
      undefined,
      async (tx) => {
        const empresa = await empresaRepository.findById(empresaId, tx);
        if (!empresa) {
          throw empresaNotFound();
        }

        await membresiaRepository.assertCorreoDisponible(input.correo, tx);
        await membresiaRepository.assertCorreoDisponible(usuarioCorreo, tx);

        const usuario = await usuarioRepository.createUsuario(
          {
            nombre: input.nombre,
            correo: usuarioCorreo,
            // Invariantes: rol ADMINISTRADOR para que el login por Membresia pase;
            // password no expuesta para que Usuario.correo no autentique holding-wide.
            passwordHash: usuarioPasswordHash,
            rol: "ADMINISTRADOR",
          },
          tx,
        );
        const membresia = await membresiaRepository.createMembresiaConCredencial(
          {
            usuarioId: usuario.id,
            empresaId,
            rol: "ADMINISTRADOR",
            habilitadoParaVenta: false,
            correo: input.correo,
            passwordHash: membresiaPasswordHash,
          },
          tx,
        );

        return {
          usuario: {
            id: usuario.id,
            nombre: usuario.nombre,
            rol: "ADMINISTRADOR",
            activo: usuario.activo,
          },
          membresia: {
            id: membresia.id,
            usuarioId: membresia.usuarioId,
            empresaId: membresia.empresaId,
            rol: "ADMINISTRADOR",
            activa: membresia.activa,
            correo: membresia.correo as string,
          },
        };
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

/**
 * Hotfix (supervisor scoped a empresa): espejo exacto de
 * `createEmpresaAdministrador` arriba, con `rol: "SUPERVISOR"` en el Usuario
 * portador y en la Membresia -- mismo mecanismo (login real por
 * `Membresia.correo`, `Usuario` portador solo requerido por
 * `auth.service.ts::login` para resolver `rolEquivalente(membresia) ===
 * usuarioDeMembresia.rol`).
 */
export async function createEmpresaSupervisor(
  empresaId: string,
  input: CreateEmpresaSupervisorInput,
): Promise<EmpresaSupervisorView> {
  const membresiaPasswordHash = await hashPassword(input.password);
  const usuarioPasswordHash = await hashPassword(randomBytes(32).toString("base64url"));
  const usuarioCorreo = correoPortadorPara("SUPERVISOR", empresaId, input.correo);

  try {
    return await runInTransaction(
      undefined,
      async (tx) => {
        const empresa = await empresaRepository.findById(empresaId, tx);
        if (!empresa) {
          throw empresaNotFound();
        }

        await membresiaRepository.assertCorreoDisponible(input.correo, tx);
        await membresiaRepository.assertCorreoDisponible(usuarioCorreo, tx);

        const usuario = await usuarioRepository.createUsuario(
          {
            nombre: input.nombre,
            correo: usuarioCorreo,
            // Invariantes: rol SUPERVISOR para que el login por Membresia pase;
            // password no expuesta para que Usuario.correo no autentique holding-wide.
            passwordHash: usuarioPasswordHash,
            rol: "SUPERVISOR",
          },
          tx,
        );
        const membresia = await membresiaRepository.createMembresiaConCredencial(
          {
            usuarioId: usuario.id,
            empresaId,
            rol: "SUPERVISOR",
            habilitadoParaVenta: false,
            correo: input.correo,
            passwordHash: membresiaPasswordHash,
          },
          tx,
        );

        return {
          usuario: {
            id: usuario.id,
            nombre: usuario.nombre,
            rol: "SUPERVISOR",
            activo: usuario.activo,
          },
          membresia: {
            id: membresia.id,
            usuarioId: membresia.usuarioId,
            empresaId: membresia.empresaId,
            rol: "SUPERVISOR",
            activa: membresia.activa,
            correo: membresia.correo as string,
          },
        };
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

/**
 * Fix (bug de seguridad: Asesor creado dentro de una empresa terminaba
 * logueando con sesión holding-wide en vez de "company"): espejo exacto de
 * `createEmpresaSupervisor` arriba, con `rol: "ASESOR"` en el Usuario
 * portador y en la Membresia -- mismo mecanismo (login real por
 * `Membresia.correo`, `Usuario` portador solo requerido por
 * `auth.service.ts::login` para resolver `rolEquivalente(membresia) ===
 * usuarioDeMembresia.rol`). `habilitadoParaVenta: false` por defecto, mismo
 * criterio que la creación de Asesor legado vía `POST /usuarios`
 * (`membresiaParaRolLegado`) -- este alta no expone ese campo, se ajusta
 * después vía edición.
 */
export async function createEmpresaAsesor(
  empresaId: string,
  input: CreateEmpresaAsesorInput,
): Promise<EmpresaAsesorView> {
  const membresiaPasswordHash = await hashPassword(input.password);
  const usuarioPasswordHash = await hashPassword(randomBytes(32).toString("base64url"));
  const usuarioCorreo = correoPortadorPara("ASESOR", empresaId, input.correo);

  try {
    return await runInTransaction(
      undefined,
      async (tx) => {
        const empresa = await empresaRepository.findById(empresaId, tx);
        if (!empresa) {
          throw empresaNotFound();
        }

        await membresiaRepository.assertCorreoDisponible(input.correo, tx);
        await membresiaRepository.assertCorreoDisponible(usuarioCorreo, tx);

        const usuario = await usuarioRepository.createUsuario(
          {
            nombre: input.nombre,
            correo: usuarioCorreo,
            // Invariantes: rol ASESOR para que el login por Membresia pase;
            // password no expuesta para que Usuario.correo no autentique holding-wide.
            passwordHash: usuarioPasswordHash,
            rol: "ASESOR",
          },
          tx,
        );
        const membresia = await membresiaRepository.createMembresiaConCredencial(
          {
            usuarioId: usuario.id,
            empresaId,
            rol: "ASESOR",
            habilitadoParaVenta: false,
            correo: input.correo,
            passwordHash: membresiaPasswordHash,
          },
          tx,
        );

        return {
          usuario: {
            id: usuario.id,
            nombre: usuario.nombre,
            rol: "ASESOR",
            activo: usuario.activo,
          },
          membresia: {
            id: membresia.id,
            usuarioId: membresia.usuarioId,
            empresaId: membresia.empresaId,
            rol: "ASESOR",
            activa: membresia.activa,
            correo: membresia.correo as string,
          },
        };
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
  usuarios: Array<AdminUsuarioListView & { presencia: PresenciaUsuarioView }>;
  total: number;
  pagina: number;
  limite: number;
}

function resolvePresenceEmpresaId(actor: AuthenticatedUser, query: ListUsuariosQuery): string | undefined {
  if (actor.empresaId !== null) return actor.empresaId;
  if (query.soloHoldingWide) return undefined;
  return query.empresaId;
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

  // Fix (bug de seguridad): mismo criterio de ramas que
  // `negociacion/producto.service.ts::listarProductos` -- (1) company-scoped:
  // forzado a su propia empresa vía `Membresia`, cualquier query param de
  // empresa/holding se ignora (anti-escalamiento, `assertUsuarioEnAlcance`
  // arriba aplica el mismo criterio por id); (2) holding-wide con
  // `query.soloHoldingWide`: SOLO los usuarios sin ninguna `Membresia`
  // (Bloque F, tarea 2 -- tab de holding-wide del panel); (3) holding-wide
  // con `query.empresaId`: drill-down opcional a UNA empresa puntual
  // (`EmpresaDetallePage`); (4) holding-wide sin ninguno de los dos: sin
  // filtro, ve todo (D2). `activa: true` en las ramas de empresa (fix,
  // decisión de equipo): una `Membresia` desactivada saca al usuario del
  // alcance administrativo de esa empresa, mismo criterio que
  // `usuarioRepository.existsEnEmpresa`.
  //
  // Decisión de prioridad (mutuamente excluyentes a nivel de intención):
  // `soloHoldingWide` gana sobre `query.empresaId` si ambos llegan juntos --
  // representa una selección explícita de modo (el tab "holding-wide" del
  // panel), mientras que `empresaId` puede quedar como residuo de query
  // string de un modo anterior (ej. volver del drill-down de una empresa sin
  // limpiar el query). Silenciar `soloHoldingWide` por un `empresaId`
  // residual rompería ese tab sin ningún error visible.
  if (actor.empresaId !== null) {
    where.membresias = { some: { empresaId: actor.empresaId, activa: true } };
  } else if (query.soloHoldingWide) {
    where.membresias = { none: {} };
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

  const presencias = getPresenceForUsuarios(
    usuarios.map((usuario) => usuario.id),
    resolvePresenceEmpresaId(actor, query),
  );

  return {
    usuarios: usuarios.map((usuario) => ({
      ...usuario,
      presencia: presencias.get(usuario.id) ?? {
        estado: "offline",
        conectadoDesde: null,
        ultimaSenalEn: null,
        desconectadoEn: null,
        conexionesActivas: 0,
      },
    })),
    total,
    pagina: query.pagina,
    limite: query.limite,
  };
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
 *   2. por cada pool de cartera (`POOLS_DE_CARTERA` — siempre los dos,
 *      `ASESOR` y `VENDEDOR`, ver comentario de esa constante) cuya cartera
 *      abierta no esté vacía, resuelve los candidatos activos vía `Membresia`
 *      (`findActivosPorRolMembresia`/`countCargaActivaPorResponsableEnEmpresa`
 *      — mismas funciones Membresia-based que `asignacion.service.ts`,
 *      Bloque D, escopeadas por la `empresaId` de cada lead) con UNA sola
 *      consulta de cada una por grupo de empresa (no una por lead — hallazgo
 *      de code-review sobre N+1 dentro de esta transacción interactiva) y
 *      distribuye la cartera en memoria con el mismo criterio de desempate
 *      que `chooseCandidato` (`asignacion.service.ts`); sin candidato
 *      disponible, aborta con 409 y NADA se persiste (ni la baja ni ninguna
 *      reasignación parcial, de ningún pool).
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
      const ahora = new Date();

      for (const pool of POOLS_DE_CARTERA) {
        const cartera = await leadRepository.findCarteraAbierta(id, pool, tx);
        if (cartera.length === 0) continue;

        // Fix (bug real, ver comentario de `POOLS_DE_CARTERA`): la cartera de
        // ESTE pool puede repartirse en más de una empresa si el usuario dado
        // de baja tiene `Membresia` activa en varias -- los candidatos y su
        // carga activa se resuelven POR empresa (mismo scoping que
        // `asignacion.service.ts::selectResponsableEnEmpresa`), nunca de
        // forma global.
        const carteraPorEmpresa = new Map<string, typeof cartera>();
        for (const lead of cartera) {
          const grupo = carteraPorEmpresa.get(lead.empresaId);
          if (grupo) {
            grupo.push(lead);
          } else {
            carteraPorEmpresa.set(lead.empresaId, [lead]);
          }
        }

        const entradas: ApplyAsignacionesEnLoteInput[] = [];
        for (const [empresaId, carteraEmpresa] of carteraPorEmpresa) {
          // Una sola consulta de candidatos y una sola de carga activa por
          // grupo de empresa (nunca una por lead, ver hallazgo de
          // code-review sobre N+1 dentro de la transacción de baja): la
          // distribución entre candidatos ocurre en memoria reusando el
          // mismo criterio de desempate que
          // `asignacion.service.ts::chooseCandidato`.
          const activos = await usuarioRepository.findActivosPorRolMembresia(pool, empresaId, tx);
          const candidatosElegibles = activos.filter((u) => u.id !== id);

          if (candidatosElegibles.length === 0) {
            throw noCandidateToReassign();
          }

          const cargas = await leadRepository.countCargaActivaPorResponsableEnEmpresa(
            pool,
            candidatosElegibles.map((u) => u.id),
            empresaId,
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
          for (const lead of carteraEmpresa) {
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
