import type { Bridge, CuentaPublicitaria, EstadoTokenCuenta } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

/**
 * D-M4-fundacion (diseño m4-bridges-crud-fundacion, DD "CuentaPublicitaria
 * is one Facebook Page, not one ad account"): `idExterno` es la unidad de
 * suscripción de la plataforma (para Meta, el ID de la Página).
 * `idExternoVinculado` es el nombre de campo de Prisma tal cual —
 * `bridge.service.ts`/`cuenta-publicitaria.service.ts` (PR3) son la única
 * capa que lo mapea al nombre de contrato público `instagramAccountId`; este
 * repositorio nunca introduce un tercer nombre.
 */
export interface CreateCuentaPublicitariaData {
  bridgeId: string;
  idExterno: string;
  nombre: string;
  idExternoVinculado?: string | null;
}

export async function create(
  data: CreateCuentaPublicitariaData,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaPublicitaria> {
  return client.cuentaPublicitaria.create({ data });
}

/** `GET /bridges/:id` embebido y `GET /bridges/:id/cuentas` (PR3) comparten esta lectura. */
export async function listByBridge(
  bridgeId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaPublicitaria[]> {
  return client.cuentaPublicitaria.findMany({ where: { bridgeId }, orderBy: { nombre: "asc" } });
}

/** `PATCH /bridges/:id/cuentas/:cuentaId` (Requirement: … PATCH toggles only activation) — solo `activa`. */
export async function updateActiva(
  id: string,
  activa: boolean,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaPublicitaria> {
  return client.cuentaPublicitaria.update({ where: { id }, data: { activa } });
}

export type CuentaPublicitariaConBridge = CuentaPublicitaria & { bridge: Bridge };

/**
 * Adaptador Meta (docs/05-bridges.md §3): el webhook de Meta solo trae el
 * `page_id` (`idExterno` en este modelo), nunca el `bridgeId` — a diferencia
 * del endpoint genérico, que resuelve el bridge vía `X-Bridge-Key`
 * (`requireBridgeKey`). `idExterno` es el ID de Página que Meta asigna, único
 * en la práctica en todo Meta; se busca sin filtrar por bridge. Incluye
 * `bridge` porque el llamador necesita `bridgeId` (para `LeadEntrante`) y
 * `bridge.redSocial` (FACEBOOK/INSTAGRAM — Meta no expone un campo
 * `platform` que distinga el origen, así que se usa el de la Página
 * suscripta).
 */
export async function findByIdExternoConBridge(
  idExterno: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaPublicitariaConBridge | null> {
  return client.cuentaPublicitaria.findFirst({ where: { idExterno }, include: { bridge: true } });
}

/**
 * Adaptador Meta (docs/05-bridges.md §8): un error de Graph API que indica
 * token inválido/revocado marca la cuenta `TOKEN_EXPIRADO` en vez de agotar
 * reintentos contra un token que ya se sabe que no sirve.
 */
export async function updateEstadoToken(
  id: string,
  estadoToken: EstadoTokenCuenta,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaPublicitaria> {
  return client.cuentaPublicitaria.update({ where: { id }, data: { estadoToken } });
}

export interface UpdateTokenData {
  tokenCifrado: string;
  tokenExpiraEn: Date | null;
}

/**
 * Endpoints de administración de token de Meta (docs/05-bridges.md §7,
 * "Carga y renovación de token con verificación inmediata de validez"): una
 * sola escritura atómica de `tokenCifrado` + `tokenExpiraEn` +
 * `estadoToken: VALIDO` — el servicio ya verificó el token contra
 * `/debug_token` antes de llamar acá (`meta-token.service.ts`), así que
 * cargar/renovar siempre deja la cuenta en estado `VALIDO`.
 */
export async function updateToken(
  id: string,
  data: UpdateTokenData,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaPublicitaria> {
  return client.cuentaPublicitaria.update({
    where: { id },
    data: { tokenCifrado: data.tokenCifrado, tokenExpiraEn: data.tokenExpiraEn, estadoToken: "VALIDO" },
  });
}

/**
 * Trabajo programado diario (docs/05-bridges.md §3, "verificación de
 * token"): universo completo de cuentas con un token cargado, sin filtrar
 * por bridge — a diferencia de `findByIdExternoConBridge` (una Página
 * puntual, resuelta desde un webhook entrante). `bridgeId` ya es una columna
 * escalar de `CuentaPublicitaria` (no una relación) — `verificacion-token.
 * service.ts` solo necesita ese valor para `registrarBridgeLog`, nunca lee
 * `cuenta.bridge.*`, así que no hace falta el `include` de la relación
 * completa.
 */
export async function listConTokenCargado(
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaPublicitariaConEmpresa[]> {
  return client.cuentaPublicitaria.findMany({
    where: { tokenCifrado: { not: null } },
    include: { bridge: { select: { empresaId: true } } },
  });
}

/**
 * `verificacion-token.service.ts`: cuando la verificación diaria confirma un
 * token vigente pero con una `tokenExpiraEn` distinta a la persistida, solo
 * se actualiza esa columna — nunca hace falta volver a cifrar el token (ya
 * está cifrado y sigue siendo el mismo), a diferencia de `updateToken`
 * (carga/renovación desde texto plano).
 */
export async function updateTokenExpiraEn(
  id: string,
  tokenExpiraEn: Date | null,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaPublicitaria> {
  return client.cuentaPublicitaria.update({ where: { id }, data: { tokenExpiraEn } });
}

/**
 * M-hardening Bloque A (WU4, spec lead-attribution, D6): primer paso del
 * lookup de dos pasos de `atribucion.service.ts::resolverAtribucion` — mismo
 * criterio que `@@unique([bridgeId, idExterno])`. `null` es un resultado
 * válido (degradación silenciosa); el llamador nunca lanza por un miss.
 */
export async function findByBridgeEIdExterno(
  bridgeId: string,
  idExterno: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaPublicitaria | null> {
  return client.cuentaPublicitaria.findUnique({
    where: { bridgeId_idExterno: { bridgeId, idExterno } },
  });
}

/**
 * M-hardening Bloque A (WU5, spec token-expiry-alerting): universo de
 * cuentas con `tokenExpiraEn` dentro de la ventana (`ahora`, `ahora +
 * fronteraDias`] — el filtro de ventana temporal es expresable en SQL vía
 * Prisma. El filtro de idempotencia ("¿ya se alertó ESTE `tokenExpiraEn`
 * exacto?") NO lo es: Prisma no soporta comparar dos columnas de la misma
 * fila en un `where` sin SQL crudo, así que `produceAlertaTokenPorExpirar`
 * (el servicio) hace esa comparación en memoria sobre este universo —
 * suficientemente acotado por la ventana de 7 días para no justificar SQL
 * crudo.
 */
/**
 * Bloque C (D5/D8, spec "Per-job isolation decisions" — `verificacion-token`):
 * `include: { bridge: { select: { empresaId } } }` — `produceAlertaTokenPorExpirar`
 * necesita el `empresaId` del bridge para cerrar el chokepoint de la alerta
 * `TOKEN_POR_EXPIRAR` sin una consulta extra por cuenta dentro del loop.
 */
export type CuentaPublicitariaConEmpresa = CuentaPublicitaria & {
  bridge: { empresaId: string };
};

export async function listPorExpirar(
  ahora: Date,
  fronteraDias: number,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaPublicitariaConEmpresa[]> {
  const limite = new Date(ahora.getTime() + fronteraDias * 24 * 60 * 60 * 1000);
  return client.cuentaPublicitaria.findMany({
    where: { tokenExpiraEn: { not: null, gt: ahora, lte: limite } },
    include: { bridge: { select: { empresaId: true } } },
  });
}

/**
 * M-hardening Bloque A (WU5): marca el `tokenExpiraEn` exacto ya alertado —
 * la única escritura del marcador de idempotencia (D-autorearme: nunca hay
 * un "reseteo" separado, solo se vuelve a escribir cuando `tokenExpiraEn`
 * cambia).
 */
export async function updateAlertaExpiracionParaEn(
  id: string,
  alertaExpiracionParaEn: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaPublicitaria> {
  return client.cuentaPublicitaria.update({ where: { id }, data: { alertaExpiracionParaEn } });
}
