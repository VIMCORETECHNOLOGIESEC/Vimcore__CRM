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
): Promise<CuentaPublicitaria[]> {
  return client.cuentaPublicitaria.findMany({
    where: { tokenCifrado: { not: null } },
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
