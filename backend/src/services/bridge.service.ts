import { Prisma, RedSocial, type Bridge, type BridgeLog, type EstadoBridge, type NivelBridgeLog } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { generarClaveBridge, hashClaveBridge } from "../lib/clave-bridge.js";
import { BRIDGE_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import { pollUnBridgeSeguro } from "../jobs/bridgeApi/poll.job.js";
import * as bridgeLogRepository from "../repositories/bridge-log.repository.js";
import * as bridgeRepository from "../repositories/bridge.repository.js";
import type { BridgeConCuentas } from "../repositories/bridge.repository.js";
import type { ListBridgesQuery } from "../schemas/bridges.schema.js";
import type { AuthenticatedUser } from "../types/authenticated-user.js";
import { toCuentaPublicitariaDto, type CuentaPublicitariaDto } from "./cuenta-publicitaria.service.js";

function bridgeNotFound(): AppError {
  return new AppError("bridge_no_encontrado", 404, "Bridge no encontrado");
}

/**
 * Fix (bug de seguridad: GET/PATCH/DELETE /bridges no filtraban por
 * empresa): mismo criterio D2 que `negociacion/producto.service.ts::
 * listarProductos` -- `usuario.empresaId === null` es holding-wide (sin
 * restricción); cualquier otro valor exige coincidencia EXACTA con
 * `Bridge.empresaId` (columna propia, a diferencia de `Usuario`). Usado por
 * cada lookup-por-id de este archivo para devolver 404 (nunca 403) cuando el
 * bridge existe pero pertenece a otra empresa -- "Direct id access is
 * denied, not leaked", mismo criterio que `leads.access.ts`.
 */
function bridgeFueraDeAlcance(usuario: AuthenticatedUser, bridge: Pick<Bridge, "empresaId">): boolean {
  return usuario.empresaId !== null && bridge.empresaId !== usuario.empresaId;
}

/**
 * El DTO emite `tokenExpiraEn: null` como constante documentada, no una
 * columna (diseño DD "no token/expiry placeholder columns in this change").
 */
const TOKEN_EXPIRA_EN = null;

export interface BridgeDto {
  id: string;
  redSocial: RedSocial;
  nombre: string;
  estado: EstadoBridge;
  ultimoLeadEn: Date | null;
  tokenExpiraEn: null;
}

/**
 * `cuentasPublicitarias` se mapea vía
 * `cuenta-publicitaria.service.ts::toCuentaPublicitariaDto` — expone
 * `instagramAccountId`, nunca el nombre de campo interno de Prisma
 * `idExternoVinculado` (diseño m4-bridges-crud-fundacion, tarea PR3.3/3.5,
 * requirement "Bridge detail embeds its accounts").
 */
export interface BridgeDetalleDto extends BridgeDto {
  cuentasPublicitarias: CuentaPublicitariaDto[];
}

function toBridgeDto(bridge: Bridge): BridgeDto {
  return {
    id: bridge.id,
    redSocial: bridge.redSocial,
    nombre: bridge.nombre,
    estado: bridge.estado,
    ultimoLeadEn: bridge.ultimoLeadEn,
    tokenExpiraEn: TOKEN_EXPIRA_EN,
  };
}

function toBridgeDetalleDto(bridge: BridgeConCuentas): BridgeDetalleDto {
  return {
    ...toBridgeDto(bridge),
    cuentasPublicitarias: bridge.cuentasPublicitarias.map(toCuentaPublicitariaDto),
  };
}

export interface CreateBridgeInput {
  redSocial: RedSocial;
  nombre: string;
  // Fix (bug de seguridad, empresaId forzado por sesión): opcional en el
  // tipo -- `resolveEmpresaId` abajo decide si hace falta y de dónde sale,
  // según el actor (ver `bridges.schema.ts`).
  empresaId?: string;
}

/**
 * Fix (bug de seguridad: POST /bridges no forzaba `empresaId` a la empresa
 * del actor): mismo criterio/mismo error que
 * `negociacion/producto.service.ts::resolveEmpresaId` -- una sesión
 * company-scoped nunca puede elegir su empresa por body (anti-escalamiento);
 * una sesión holding-wide (D2) no tiene una empresa de sesión de la que
 * derivarlo, así que el body debe traerla explícita. Replicado acá en vez de
 * importado (mismo criterio de duplicación deliberada que
 * `usuarios.service.ts::resolveEmpresaId`).
 */
function resolveEmpresaId(usuario: AuthenticatedUser, empresaIdBody: string | undefined): string {
  if (usuario.empresaId !== null) return usuario.empresaId;
  if (!empresaIdBody) {
    throw new AppError(
      "empresa_requerida",
      400,
      "Debes indicar empresaId explícitamente para una sesión holding-wide",
    );
  }
  return empresaIdBody;
}

export interface ClaveApiResult {
  bridge: BridgeDto;
  claveApi: string;
}

/**
 * `estado=INACTIVO` ya es el default del schema (`bridge.repository.ts`
 * pasa `data` tal cual), así que no se envía `estado` acá — una sola fuente
 * de verdad para el default (ver docstring de `bridge.repository.create`,
 * requirement "Bridge creation starts inactive with one-time plaintext key").
 */
export async function createBridge(usuario: AuthenticatedUser, input: CreateBridgeInput): Promise<ClaveApiResult> {
  const empresaId = resolveEmpresaId(usuario, input.empresaId);
  const claveApi = generarClaveBridge();
  const bridge = await bridgeRepository.create({
    redSocial: input.redSocial,
    nombre: input.nombre,
    claveApiHash: hashClaveBridge(claveApi),
    empresaId,
  });
  return { bridge: toBridgeDto(bridge), claveApi };
}

export interface FindBridgesResult {
  bridges: BridgeDetalleDto[];
  total: number;
  pagina: number;
  limite: number;
}

/**
 * Fix (GET /bridges no pagina ni filtra): mismo patrón de
 * `usuarios.service.ts::buildWhere` + `findUsuarios` — `where` armado acá
 * (búsqueda por `nombre`, filtros exactos por `redSocial`/`estado`),
 * paginación/conteo resueltos por el repositorio.
 *
 * Fix (bug de seguridad, scope por empresa): mismo criterio de 3 ramas que
 * `negociacion/producto.service.ts::listarProductos` -- (1) company-scoped:
 * forzado a su propia empresa, el query param se ignora (anti-escalamiento);
 * (2) holding-wide con `query.empresaId`: drill-down opcional a UNA empresa
 * puntual (`EmpresaDetallePage`); (3) holding-wide sin `query.empresaId`: sin
 * filtro, ve todo (D2).
 */
function buildBridgeWhere(query: ListBridgesQuery, usuario: AuthenticatedUser): Prisma.BridgeWhereInput {
  const where: Prisma.BridgeWhereInput = {};

  if (query.busqueda) {
    where.nombre = { contains: query.busqueda, mode: "insensitive" };
  }
  if (query.redSocial) where.redSocial = query.redSocial;
  if (query.estado) where.estado = query.estado;

  if (usuario.empresaId !== null) {
    where.empresaId = usuario.empresaId;
  } else if (query.empresaId) {
    where.empresaId = query.empresaId;
  }

  return where;
}

export async function findBridges(usuario: AuthenticatedUser, query: ListBridgesQuery): Promise<FindBridgesResult> {
  const where = buildBridgeWhere(query, usuario);
  const { bridges, total } = await bridgeRepository.findMany(where, {
    skip: (query.pagina - 1) * query.limite,
    take: query.limite,
  });

  return { bridges: bridges.map(toBridgeDetalleDto), total, pagina: query.pagina, limite: query.limite };
}

export async function getBridgeById(usuario: AuthenticatedUser, id: string): Promise<BridgeDetalleDto> {
  const bridge = await bridgeRepository.findById(id);
  if (!bridge || bridgeFueraDeAlcance(usuario, bridge)) {
    throw bridgeNotFound();
  }
  return toBridgeDetalleDto(bridge);
}

export interface UpdateBridgeInput {
  nombre?: string;
  estado?: "ACTIVO" | "INACTIVO";
}

/**
 * Requirement: PATCH /bridges/:id es el único endpoint para rename/
 * deactivate/reactivate. El whitelist de `estado` (excluye
 * `TOKEN_EXPIRADO`/`ERROR`) y "al menos un campo" ya se resolvieron en
 * `bridges.schema.ts` — acá solo queda la existencia del bridge.
 */
export async function updateBridge(
  usuario: AuthenticatedUser,
  id: string,
  input: UpdateBridgeInput,
): Promise<BridgeDto> {
  const existente = await bridgeRepository.findById(id);
  if (!existente || bridgeFueraDeAlcance(usuario, existente)) {
    throw bridgeNotFound();
  }
  const actualizado = await bridgeRepository.update(id, input);

  // Fix (backfill inmediato al activar, 2026-08-31): sin esto, un bridge
  // API_EXTERNA recién activado esperaba hasta 2 minutos (el tick del job)
  // para traer los leads que la API del cliente ya tenía cargados desde
  // antes. `pollUnBridgeSeguro` se autoguarda (config incompleta/estado
  // distinto de ACTIVO -> no-op) y ya maneja su propio try/catch +
  // `bridge_logs`, así que es seguro dispararla sin condición extra ni
  // `.catch` propio acá. Fire-and-forget a propósito: la activación del
  // bridge nunca debe esperar ni fallar por una API externa lenta o caída
  // -- el tick de 2 minutos reintenta solo de cualquier forma.
  if (actualizado.redSocial === "API_EXTERNA") {
    void pollUnBridgeSeguro(actualizado);
  }

  return toBridgeDto(actualizado);
}

export type ResultadoEliminacion = "BAJA_FISICA" | "BAJA_LOGICA";

export interface DeleteBridgeResult {
  resultado: ResultadoEliminacion;
  bridge: BridgeDto;
}

/**
 * Cuenta y borra/desactiva dentro de la misma transacción interactiva
 * (diseño DD "delete mode from leadsRecibidos.count", requirement
 * "Delete mode is decided by lead count, never ultimoLeadEn") — evita una
 * carrera con una ingesta concurrente entre el conteo y la decisión.
 */
export async function deleteBridge(usuario: AuthenticatedUser, id: string): Promise<DeleteBridgeResult> {
  return runInTransaction(
    undefined,
    async (tx) => {
      const existente = await bridgeRepository.findById(id, tx);
      if (!existente || bridgeFueraDeAlcance(usuario, existente)) {
        throw bridgeNotFound();
      }

      const leadsRecibidosCount = await bridgeRepository.countLeadsRecibidos(id, tx);
      if (leadsRecibidosCount === 0) {
        await bridgeRepository.remove(id, tx);
        return { resultado: "BAJA_FISICA" as const, bridge: toBridgeDto(existente) };
      }

      const desactivado = await bridgeRepository.update(id, { estado: "INACTIVO" }, tx);
      return { resultado: "BAJA_LOGICA" as const, bridge: toBridgeDto(desactivado) };
    },
    BRIDGE_TRANSACTION_BOUNDS,
  );
}

/**
 * Nunca toca `estado` — solo reemplaza el hash (diseño DD
 * "generarClaveBridge() shape and lifecycle", user-confirmed; requirement
 * "Key regeneration never changes bridge state").
 */
export async function regenerateClave(usuario: AuthenticatedUser, id: string): Promise<ClaveApiResult> {
  const existente = await bridgeRepository.findById(id);
  if (!existente || bridgeFueraDeAlcance(usuario, existente)) {
    throw bridgeNotFound();
  }

  const claveApi = generarClaveBridge();
  const bridge = await bridgeRepository.updateClaveApiHash(id, hashClaveBridge(claveApi));
  return { bridge: toBridgeDto(bridge), claveApi };
}

/**
 * Fix (2026-08-19, docs/05-bridges.md §5): "tener una integración de ingesta
 * real" es un juicio de producto, no algo derivable del enum `RedSocial` —
 * `listRedesSoportadas` ya no puede ser un passthrough de
 * `Object.values(RedSocial)`. X y GOOGLE_FORMS comparten exactamente el mismo
 * mecanismo genérico (`POST /ingesta/generico`), pero solo GOOGLE_FORMS tiene
 * una fuente real construida (Apps Script) — X está pendiente de confirmación
 * con el cliente ("nadie construyó/probó una fuente real todavía").
 * INSTAGRAM no es un tipo de bridge creable: viaja como `instagramAccountId`
 * dentro de un bridge FACEBOOK (ver `cuenta-publicitaria.service.ts`).
 * LINKEDIN usa OAuth + webhook/polling — implementado desde el hotfix del
 * 2026-08-31 (ver comentario de la entrada LINKEDIN abajo). Esta tabla es la
 * única fuente de verdad de "implementado".
 */
const RED_SOCIAL_IMPLEMENTACION: Record<
  RedSocial,
  { implementado: boolean; mecanismo: "webhook-meta" | "generico" | "polling-linkedin" | "polling-api-generica" }
> = {
  FACEBOOK: { implementado: true, mecanismo: "webhook-meta" },
  INSTAGRAM: { implementado: false, mecanismo: "webhook-meta" },
  GOOGLE_FORMS: { implementado: true, mecanismo: "generico" },
  X: { implementado: false, mecanismo: "generico" },
  // Hotfix (2026-08-31): flujo LinkedIn de punta a punta ya construido y
  // testeado -- `POST /bridges` con `redSocial: "LINKEDIN"` usa el mismo
  // `createBridge` genérico (sin caso especial) que FACEBOOK/GOOGLE_FORMS/
  // API_EXTERNA, y el receptor del webhook (`GET`/`POST
  // /api/v1/integraciones/linkedin/webhook`) + OAuth (`linkedin-oauth.
  // service.ts::startOAuth`) + polling ya existen (ver P2 M4 en
  // docs/06-modulos-backend.md). `implementado: false` era el único gate que
  // faltaba levantar para que el catálogo lo exponga.
  LINKEDIN: { implementado: true, mecanismo: "polling-linkedin" },
  // bridgeApi: adapter + job de polling + endpoints de config ya existen
  // (jobs/bridgeApi/poll.job.ts) -- implementado de verdad, no un enum
  // reservado para después.
  API_EXTERNA: { implementado: true, mecanismo: "polling-api-generica" },
  // whatsappMessages: fix mecánico requerido por el nuevo valor de enum del
  // schema aprobado (`RedSocial.WHATSAPP`) -- sin esta entrada,
  // `RED_SOCIAL_IMPLEMENTACION` deja de ser un `Record<RedSocial, ...>`
  // válido y el build entero falla. `implementado: false`: WhatsApp
  // deliberadamente NUNCA es un tipo de Bridge creable vía `POST /bridges`
  // (ver el comentario del schema, "WhatsApp NUNCA tiene un Bridge propio")
  // -- se conecta por su propio flujo OAuth (`GET /whatsapp/conectar`) y
  // webhook dedicado (`POST /webhooks/whatsapp`), nunca por este catálogo.
  // `mecanismo: "webhook-meta"` solo describe el transporte subyacente
  // (mismo criterio que INSTAGRAM arriba, también `implementado: false`),
  // no una promesa de que se pueda crear un Bridge de este tipo.
  WHATSAPP: { implementado: false, mecanismo: "webhook-meta" },
};

/**
 * `GET /bridges/catalogo/redes-soportadas` (Requirement: Network catalogs
 * are enum-derived and deduplicated, acotado por el filtro de "implementado"
 * de arriba). Función pura — no toca la BD, así que no es `async`
 * (preferencia de funciones puras del ciclo TDD).
 */
export function listRedesSoportadas(): RedSocial[] {
  return Object.values(RedSocial).filter((red) => RED_SOCIAL_IMPLEMENTACION[red].implementado);
}

/** `GET /bridges/redes-activas`: redes con al menos un bridge no eliminado, sin duplicados (Requirement: Network catalogs are enum-derived and deduplicated). */
export async function listRedesActivas(): Promise<RedSocial[]> {
  return bridgeRepository.listRedesActivas();
}

const LOGS_LIMITE_DEFAULT = 100;
const LOGS_LIMITE_CAP = 500;

/**
 * `GET /bridges/:id/logs` (diseño DD "log reads are capped server-side"):
 * única fuente de verdad del clamp — default 100, cap duro 500. Función pura,
 * testeable sin BD ni fixtures de 500 filas.
 */
export function resolveLimiteLogs(limiteSolicitado: number | undefined): number {
  return Math.min(limiteSolicitado ?? LOGS_LIMITE_DEFAULT, LOGS_LIMITE_CAP);
}

export interface ListarLogsFiltros {
  nivel?: NivelBridgeLog;
  fechaDesde?: Date;
  fechaHasta?: Date;
  limite?: number;
}

export async function listLogs(
  usuario: AuthenticatedUser,
  id: string,
  filtros: ListarLogsFiltros,
): Promise<BridgeLog[]> {
  const existente = await bridgeRepository.findById(id);
  if (!existente || bridgeFueraDeAlcance(usuario, existente)) {
    throw bridgeNotFound();
  }

  const limite = resolveLimiteLogs(filtros.limite);
  return bridgeLogRepository.listByBridge(
    { bridgeId: id, nivel: filtros.nivel, fechaDesde: filtros.fechaDesde, fechaHasta: filtros.fechaHasta },
    limite,
  );
}
