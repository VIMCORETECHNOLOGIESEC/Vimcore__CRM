import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import { decrypt, encrypt } from "../../lib/cifrado-token.js";
import { logger } from "../../lib/logger.js";
import { runWithTenantContext } from "../../lib/prisma.js";
import * as conexionRepository from "../../repositories/metaAds/cuenta-anuncios-conexion.repository.js";
import type { CuentaAnunciosConexionSafe } from "../../repositories/metaAds/cuenta-anuncios-conexion.repository.js";
import * as oauthStateRepository from "../../repositories/metaAds/cuenta-anuncios-oauth-state.repository.js";
import {
  metaAdsTokenResponseSchema,
  type MetaAdsConexionBody,
  type MetaAdsOAuthCallbackQuery,
} from "../../schemas/metaAds/meta-ads-oauth.schema.js";
import type {
  MetaAdsConexionDto,
  MetaAdsCuentaDescubiertaDto,
  MetaAdsOAuthCallbackDto,
  MetaAdsOAuthStartDto,
} from "../../types/metaAds/meta-ads-oauth.dto.js";
import { GRAPH_API_BASE_URL } from "../meta-webhook.service.js";
import { MetaAdsApiError, MetaMarketingApiClient } from "./meta-marketing-api.service.js";

const OFFICIAL_AUTH_DIALOG_BASE_URL = "https://www.facebook.com/dialog/oauth";
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const OAUTH_STATE_BYTES = 32;
const SELECCION_TTL_MS = 10 * 60_000;
const META_ADS_OAUTH_SCOPES = ["ads_read"] as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function configurationUnavailable(): AppError {
  return new AppError("meta_ads_oauth_no_configurado", 503, "La integración de Meta Ads no está configurada");
}

function invalidState(): AppError {
  return new AppError("meta_ads_oauth_state_invalido", 401, "El estado de autorización de Meta Ads es inválido o expiró");
}

function tokenExchangeFailed(): AppError {
  return new AppError("meta_ads_oauth_intercambio_fallido", 502, "No se pudo intercambiar el código de autorización con Meta");
}

function cancellationReported(): AppError {
  return new AppError("meta_ads_oauth_cancelado", 400, "La autorización de Meta Ads fue cancelada");
}

function seleccionInvalida(): AppError {
  return new AppError("meta_ads_seleccion_invalida", 401, "La selección de cuenta de anuncios es inválida o expiró — reiniciá el flujo de conexión");
}

function requireRedirectUri(): string {
  if (!env.META_ADS_OAUTH_REDIRECT_URI) throw configurationUnavailable();
  return env.META_ADS_OAUTH_REDIRECT_URI;
}

interface SeleccionPayload {
  empresaId: string;
  usuarioId: string;
  accessToken: string;
  cuentas: MetaAdsCuentaDescubiertaDto[];
  tokenExpiraEn: string | null;
  expiraEn: number;
}

export async function startMetaAdsOAuth(
  empresaId: string,
  usuarioId: string,
): Promise<MetaAdsOAuthStartDto> {
  const redirectUri = requireRedirectUri();
  const state = Buffer.from(nodeRandomBytes(OAUTH_STATE_BYTES)).toString("base64url");
  const expiraEn = new Date(Date.now() + OAUTH_STATE_TTL_MS);
  await oauthStateRepository.createState({ stateHash: sha256(state), empresaId, usuarioId, expiraEn });

  const authorizationUrl = new URL(OFFICIAL_AUTH_DIALOG_BASE_URL);
  authorizationUrl.search = new URLSearchParams({
    client_id: env.META_APP_ID,
    redirect_uri: redirectUri,
    state,
    scope: META_ADS_OAUTH_SCOPES.join(","),
    response_type: "code",
  }).toString();

  return { authorizationUrl: authorizationUrl.toString(), expiraEn: expiraEn.toISOString() };
}

async function exchangeAuthorizationCode(code: string, redirectUri: string): Promise<{ accessToken: string; tokenExpiraEn: Date | null; scopes: string[] | null }> {
  const url = new URL(`${GRAPH_API_BASE_URL}/oauth/access_token`);
  url.search = new URLSearchParams({
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    redirect_uri: redirectUri,
    code,
  }).toString();

  let cuerpo: unknown;
  let ok: boolean;
  try {
    const respuesta = await fetch(url);
    ok = respuesta.ok;
    cuerpo = await respuesta.json().catch(() => null);
  } catch {
    throw tokenExchangeFailed();
  }
  if (!ok) throw tokenExchangeFailed();

  const parsed = metaAdsTokenResponseSchema.safeParse(cuerpo);
  if (!parsed.success) throw tokenExchangeFailed();
  const scopeFromString = parsed.data.scope?.split(/[ ,]+/).filter(Boolean);
  const scopes = parsed.data.granted_scopes ?? (scopeFromString && scopeFromString.length > 0 ? scopeFromString : null);
  if (scopes && !scopes.includes("ads_read")) {
    throw new AppError("meta_ads_scope_insuficiente", 403, "Meta no autorizó el permiso mínimo ads_read");
  }
  return {
    accessToken: parsed.data.access_token,
    tokenExpiraEn: parsed.data.expires_in ? new Date(Date.now() + parsed.data.expires_in * 1_000) : null,
    scopes,
  };
}

export async function completeMetaAdsOAuthCallback(
  callback: MetaAdsOAuthCallbackQuery,
): Promise<MetaAdsOAuthCallbackDto> {
  const redirectUri = requireRedirectUri();
  if (!callback.state) throw invalidState();

  // Fix (RLS, 2026-08-31): esta ruta NUNCA pasa por `requireAuthentication`
  // (Meta redirige el navegador acá sin JWT -- la identidad se resuelve
  // recién al consumir el state), así que no hay ningún `TenantContext`
  // ambiente fijado para este request. `cuentas_anuncios_oauth_states` SÍ
  // tiene RLS real (a diferencia de `whatsapp_oauth_states`, que no la
  // tiene y por eso nunca mostró este bug) -- sin `app.tenant_unrestricted`
  // fijado, la política filtraba la fila del state aunque existiera, no
  // hubiera vencido y no estuviera usada: el `UPDATE` de
  // `consumeValidState` matcheaba cero filas en silencio (no falla con
  // 42501 como un INSERT, un UPDATE que RLS filtra completo simplemente no
  // afecta ninguna fila) y esto se veía indistinguible de "state realmente
  // inválido/expirado". Mismo criterio holding-wide que
  // `meta-webhook.service.ts::procesarNotificacionMeta`/
  // `bridgeApi/poll.job.ts::pollBridgesApiExterna` para código sin actor
  // autenticado.
  const consumedState = await runWithTenantContext({ empresaId: null }, () =>
    oauthStateRepository.consumeValidState(sha256(callback.state as string)),
  );
  if (!consumedState) throw invalidState();
  if (callback.error) throw cancellationReported();
  if (!callback.code) {
    throw new AppError("meta_ads_oauth_callback_invalido", 400, "El callback de Meta Ads no contiene un código de autorización");
  }

  const tokenResponse = await exchangeAuthorizationCode(callback.code, redirectUri);
  const cuentas = await new MetaMarketingApiClient(tokenResponse.accessToken).discoverAdAccounts().catch((error: unknown) => {
    // Fix (visibilidad, 2026-08-31): antes este catch descartaba el error
    // real sin dejar rastro -- un 502 quedaba indistinguible de cualquier
    // causa (permiso faltante, cuenta sin ads_read, token sin scope
    // suficiente para /me/adaccounts pese a pasar la validación de scope
    // del intercambio, error transitorio de Graph API). Nunca se expone al
    // cliente HTTP (el mensaje de arriba sigue siendo genérico) -- solo se
    // loguea para poder diagnosticar sin adivinar.
    //
    // `holdingWide: true` explícito (no alcanza con que el punto anterior
    // haya usado `runWithTenantContext` -- ese `with` ya cerró): sin esto,
    // `logger.ts::loggerOptions` (fix de logs de negocio sin contexto tenant,
    // ver `3c62698`) suprime la línea entera con "Salida de log suprimida
    // por contexto tenant ausente" -- confirmado en producción, el primer
    // intento de este mismo fix no dejó rastro por esto mismo. Mismo
    // criterio que `whatsapp-webhook.service.ts` para logs sin actor
    // autenticado.
    if (error instanceof MetaAdsApiError) {
      logger.error(
        { holdingWide: true, kind: error.kind, status: error.status, body: error.body },
        "meta-ads-oauth: fallo discoverAdAccounts",
      );
    } else {
      logger.error({ holdingWide: true, err: error }, "meta-ads-oauth: fallo inesperado en discoverAdAccounts");
    }
    throw new AppError("meta_ads_descubrimiento_fallido", 502, "No se pudieron consultar las cuentas de anuncios disponibles");
  });

  const expiraEn = Date.now() + SELECCION_TTL_MS;
  const payload: SeleccionPayload = {
    empresaId: consumedState.empresaId,
    usuarioId: consumedState.usuarioId,
    accessToken: tokenResponse.accessToken,
    cuentas,
    tokenExpiraEn: tokenResponse.tokenExpiraEn?.toISOString() ?? null,
    expiraEn,
  };

  return { cuentas, seleccion: encrypt(JSON.stringify(payload)), expiraEn: new Date(expiraEn).toISOString() };
}

export async function getMetaAdsConexion(empresaId: string): Promise<MetaAdsConexionDto | null> {
  const conexion = await conexionRepository.findByEmpresaId(empresaId);
  return conexion ? toDto(conexion) : null;
}

function toDto(conexion: CuentaAnunciosConexionSafe): MetaAdsConexionDto {
  return {
    id: conexion.id,
    empresaId: conexion.empresaId,
    cuentaAnunciosIdExterno: conexion.cuentaAnunciosIdExterno,
    nombre: conexion.nombre,
    moneda: conexion.moneda,
    zonaHoraria: conexion.zonaHoraria,
    estado: conexion.estado,
    tokenExpiraEn: conexion.tokenExpiraEn?.toISOString() ?? null,
    ultimaSincronizacionEn: conexion.ultimaSincronizacionEn?.toISOString() ?? null,
    ultimoError: conexion.ultimoError,
    creadoEn: conexion.creadoEn.toISOString(),
    actualizadoEn: conexion.actualizadoEn.toISOString(),
  };
}

export async function createMetaAdsConexion(
  usuario: { id: string; empresaId: string | null },
  body: MetaAdsConexionBody,
): Promise<MetaAdsConexionDto> {
  let payload: SeleccionPayload;
  try {
    payload = JSON.parse(decrypt(body.seleccion)) as SeleccionPayload;
  } catch {
    throw seleccionInvalida();
  }

  if (typeof payload.expiraEn !== "number" || Date.now() > payload.expiraEn) throw seleccionInvalida();
  if (payload.usuarioId !== usuario.id) throw seleccionInvalida();

  const empresaObjetivo = usuario.empresaId ?? body.empresaId;
  if (!empresaObjetivo) {
    throw new AppError("meta_ads_empresa_requerida", 400, "Debes indicar la empresa destino");
  }
  if (empresaObjetivo !== payload.empresaId) throw seleccionInvalida();

  const cuenta = payload.cuentas.find((item) => item.cuentaAnunciosIdExterno === body.cuentaAnunciosIdExterno);
  if (!cuenta) {
    throw new AppError("meta_ads_cuenta_invalida", 422, "La cuenta de anuncios indicada no está entre las descubiertas para esta autorización");
  }

  const conexion = await conexionRepository.upsertConexion({
    empresaId: payload.empresaId,
    autorizadoPorUsuarioId: usuario.id,
    cuentaAnunciosIdExterno: cuenta.cuentaAnunciosIdExterno,
    nombre: cuenta.nombre,
    moneda: cuenta.moneda,
    zonaHoraria: cuenta.zonaHoraria,
    tokenCifrado: encrypt(payload.accessToken),
    tokenExpiraEn: payload.tokenExpiraEn ? new Date(payload.tokenExpiraEn) : null,
  });

  return toDto(conexion);
}
