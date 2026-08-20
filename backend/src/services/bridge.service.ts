import { Prisma, RedSocial, type Bridge, type BridgeLog, type EstadoBridge, type NivelBridgeLog } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { generarClaveBridge, hashClaveBridge } from "../lib/clave-bridge.js";
import { BRIDGE_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import * as bridgeLogRepository from "../repositories/bridge-log.repository.js";
import * as bridgeRepository from "../repositories/bridge.repository.js";
import type { BridgeConCuentas } from "../repositories/bridge.repository.js";
import type { ListBridgesQuery } from "../schemas/bridges.schema.js";
import { toCuentaPublicitariaDto, type CuentaPublicitariaDto } from "./cuenta-publicitaria.service.js";

function bridgeNotFound(): AppError {
  return new AppError("bridge_no_encontrado", 404, "Bridge no encontrado");
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
export async function createBridge(input: CreateBridgeInput): Promise<ClaveApiResult> {
  const claveApi = generarClaveBridge();
  const bridge = await bridgeRepository.create({
    redSocial: input.redSocial,
    nombre: input.nombre,
    claveApiHash: hashClaveBridge(claveApi),
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
 */
function buildBridgeWhere(query: ListBridgesQuery): Prisma.BridgeWhereInput {
  const where: Prisma.BridgeWhereInput = {};

  if (query.busqueda) {
    where.nombre = { contains: query.busqueda, mode: "insensitive" };
  }
  if (query.redSocial) where.redSocial = query.redSocial;
  if (query.estado) where.estado = query.estado;

  return where;
}

export async function findBridges(query: ListBridgesQuery): Promise<FindBridgesResult> {
  const where = buildBridgeWhere(query);
  const { bridges, total } = await bridgeRepository.findMany(where, {
    skip: (query.pagina - 1) * query.limite,
    take: query.limite,
  });

  return { bridges: bridges.map(toBridgeDetalleDto), total, pagina: query.pagina, limite: query.limite };
}

export async function getBridgeById(id: string): Promise<BridgeDetalleDto> {
  const bridge = await bridgeRepository.findById(id);
  if (!bridge) {
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
export async function updateBridge(id: string, input: UpdateBridgeInput): Promise<BridgeDto> {
  const existente = await bridgeRepository.findById(id);
  if (!existente) {
    throw bridgeNotFound();
  }
  const actualizado = await bridgeRepository.update(id, input);
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
export async function deleteBridge(id: string): Promise<DeleteBridgeResult> {
  return runInTransaction(
    undefined,
    async (tx) => {
      const existente = await bridgeRepository.findById(id, tx);
      if (!existente) {
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
export async function regenerateClave(id: string): Promise<ClaveApiResult> {
  const existente = await bridgeRepository.findById(id);
  if (!existente) {
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
 * LINKEDIN requiere OAuth + polling cada 5 minutos, un mecanismo sin
 * adaptador ni job en este código hoy. Esta tabla es la única fuente de
 * verdad de "implementado".
 */
const RED_SOCIAL_IMPLEMENTACION: Record<
  RedSocial,
  { implementado: boolean; mecanismo: "webhook-meta" | "generico" | "polling-linkedin" }
> = {
  FACEBOOK: { implementado: true, mecanismo: "webhook-meta" },
  INSTAGRAM: { implementado: false, mecanismo: "webhook-meta" },
  GOOGLE_FORMS: { implementado: true, mecanismo: "generico" },
  X: { implementado: false, mecanismo: "generico" },
  LINKEDIN: { implementado: false, mecanismo: "polling-linkedin" },
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

export async function listLogs(id: string, filtros: ListarLogsFiltros): Promise<BridgeLog[]> {
  const existente = await bridgeRepository.findById(id);
  if (!existente) {
    throw bridgeNotFound();
  }

  const limite = resolveLimiteLogs(filtros.limite);
  return bridgeLogRepository.listByBridge(
    { bridgeId: id, nivel: filtros.nivel, fechaDesde: filtros.fechaDesde, fechaHasta: filtros.fechaHasta },
    limite,
  );
}
