import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import { decrypt, encrypt } from "../../lib/cifrado-token.js";
import * as whatsappConexionRepository from "../../repositories/whatsappMessages/whatsapp-conexion.repository.js";
import type { WhatsAppConexionSafe } from "../../repositories/whatsappMessages/whatsapp-conexion.repository.js";
import * as whatsappOAuthStateRepository from "../../repositories/whatsappMessages/whatsapp-oauth-state.repository.js";
import {
  whatsappTokenResponseSchema,
  type WhatsAppConexionBody,
  type WhatsAppOAuthCallbackQuery,
} from "../../schemas/whatsappMessages/whatsapp-oauth.schema.js";
import type {
  WhatsAppConexionDto,
  WhatsAppNumeroDescubiertoDto,
  WhatsAppOAuthCallbackDto,
  WhatsAppOAuthStartDto,
} from "../../types/whatsappMessages/whatsapp-oauth.dto.js";
import { GRAPH_API_BASE_URL } from "../meta-webhook.service.js";
import { descubrirNumeros } from "./whatsapp-cloud-api.service.js";

/**
 * Diálogo de autorización de Meta ("Facebook Login for Business") — host
 * `www.facebook.com`, distinto de `GRAPH_API_BASE_URL` (`graph.facebook.com`,
 * usado para el intercambio de token y el resto de llamadas de Graph API).
 * Sin segmento de versión explícito, mismo criterio que el resto de este
 * módulo (ver `whatsapp-cloud-api.service.ts`).
 */
const OFFICIAL_AUTH_DIALOG_BASE_URL = "https://www.facebook.com/dialog/oauth";
/**
 * Fix (WhatsApp OAuth connect, 2026-08-31): `exchangeAuthorizationCode`
 * llamaba a `fetch(url)` sin timeout ni `AbortSignal` -- si Meta no
 * respondía, la request de Express quedaba colgada indefinidamente en vez de
 * fallar con un error visible (nada queda logueado, ni éxito ni error: el
 * bug se manifestaba como "no pasa nada" del lado del usuario). Mismo valor
 * que `linkedin-api.service.ts::LINKEDIN_API_TIMEOUT_MS`, por consistencia.
 */
const META_TOKEN_EXCHANGE_TIMEOUT_MS = 10_000;
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const OAUTH_STATE_BYTES = 32;
/** El blob `seleccion` (ver `WhatsAppOAuthCallbackDto`) vive el mismo TTL que el state que lo originó. */
const SELECCION_TTL_MS = 10 * 60_000;
/**
 * Scopes de Embedded Signup (Meta, "WhatsApp Business Platform — Embedded
 * Signup"). Best-effort — igual nota que `whatsapp-cloud-api.service.ts::
 * descubrirNumeros`: verificar contra la guía vigente de Meta antes de
 * producción.
 */
const WHATSAPP_OAUTH_SCOPES = [
  "whatsapp_business_management",
  "whatsapp_business_messaging",
  "business_management",
] as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function configurationUnavailable(): AppError {
  return new AppError(
    "whatsapp_oauth_no_configurado",
    503,
    "La integración de WhatsApp no está configurada",
  );
}

function invalidState(): AppError {
  return new AppError(
    "whatsapp_oauth_state_invalido",
    401,
    "El estado de autorización de WhatsApp es inválido o expiró",
  );
}

function tokenExchangeFailed(): AppError {
  return new AppError(
    "whatsapp_oauth_intercambio_fallido",
    502,
    "No se pudo intercambiar el código de autorización con Meta",
  );
}

function cancellationReported(): AppError {
  return new AppError("whatsapp_oauth_cancelado", 400, "La autorización de WhatsApp fue cancelada");
}

function seleccionInvalida(): AppError {
  return new AppError(
    "whatsapp_seleccion_invalida",
    401,
    "La selección de número de WhatsApp es inválida o expiró — reiniciá el flujo de conexión",
  );
}

function requireRedirectUri(): string {
  if (!env.WHATSAPP_OAUTH_REDIRECT_URI) throw configurationUnavailable();
  return env.WHATSAPP_OAUTH_REDIRECT_URI;
}

/**
 * Forma exacta del payload cifrado que viaja como `seleccion` (ver el
 * comentario de diseño en `types/whatsappMessages/whatsapp-oauth.dto.ts`):
 * el schema aprobado (`WhatsAppOAuthState`) no tiene ninguna columna para
 * retener el access token exchangeado entre `GET /whatsapp/callback` y
 * `POST /whatsapp/conexion` — este blob cifrado (AES-256-GCM,
 * `lib/cifrado-token.ts`, mismo mecanismo que cualquier token en reposo) es
 * la decisión de diseño que cierra ese hueco sin tocar el schema. El cliente
 * lo recibe y lo reenvía tal cual — nunca puede leerlo ni alterarlo sin que
 * GCM lo detecte (`decrypt` lanza ante cualquier alteración).
 */
interface SeleccionPayload {
  empresaId: string;
  usuarioId: string;
  accessToken: string;
  numeros: WhatsAppNumeroDescubiertoDto[];
  expiraEn: number;
}

/** `GET /whatsapp/conectar` (ADMINISTRADOR) — `empresaId` ya resuelto por el controller (JWT o query param holding-wide). */
export async function startWhatsAppOAuth(
  empresaId: string,
  usuarioId: string,
): Promise<WhatsAppOAuthStartDto> {
  const redirectUri = requireRedirectUri();

  const state = Buffer.from(nodeRandomBytes(OAUTH_STATE_BYTES)).toString("base64url");
  const expiraEn = new Date(Date.now() + OAUTH_STATE_TTL_MS);
  await whatsappOAuthStateRepository.createState({
    stateHash: sha256(state),
    empresaId,
    usuarioId,
    expiraEn,
  });

  const authorizationUrl = new URL(OFFICIAL_AUTH_DIALOG_BASE_URL);
  authorizationUrl.search = new URLSearchParams({
    client_id: env.META_APP_ID,
    redirect_uri: redirectUri,
    state,
    scope: WHATSAPP_OAUTH_SCOPES.join(","),
    response_type: "code",
  }).toString();

  return { authorizationUrl: authorizationUrl.toString(), expiraEn: expiraEn.toISOString() };
}

async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string }> {
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
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(META_TOKEN_EXCHANGE_TIMEOUT_MS) });
    ok = respuesta.ok;
    cuerpo = await respuesta.json().catch(() => null);
  } catch {
    throw tokenExchangeFailed();
  }
  if (!ok) throw tokenExchangeFailed();

  const parsed = whatsappTokenResponseSchema.safeParse(cuerpo);
  if (!parsed.success) throw tokenExchangeFailed();
  return parsed.data;
}

/**
 * `GET /whatsapp/callback` — sin autenticación de usuario (Meta redirige el
 * navegador del administrador acá, mismo criterio que
 * `linkedin.routes.ts::getLinkedInOAuthCallback`, sin `requireAuthentication`).
 * Identifica al actor por el `state` consumido, nunca por un JWT. NO persiste
 * ninguna conexión — solo devuelve la lista descubierta más el blob
 * `seleccion` que `POST /whatsapp/conexion` necesita para completar el flujo
 * (D-mensajería, "NO conecta automático").
 */
export async function completeWhatsAppOAuthCallback(
  callback: WhatsAppOAuthCallbackQuery,
): Promise<WhatsAppOAuthCallbackDto> {
  const redirectUri = requireRedirectUri();
  if (!callback.state) throw invalidState();

  const consumedState = await whatsappOAuthStateRepository.consumeValidState(sha256(callback.state));
  if (!consumedState) throw invalidState();
  if (callback.error) throw cancellationReported();
  if (!callback.code) {
    throw new AppError(
      "whatsapp_oauth_callback_invalido",
      400,
      "El callback de WhatsApp no contiene un código de autorización",
    );
  }

  const tokenResponse = await exchangeAuthorizationCode(callback.code, redirectUri);
  const numeros = await descubrirNumeros(tokenResponse.access_token);

  const expiraEn = Date.now() + SELECCION_TTL_MS;
  const payload: SeleccionPayload = {
    empresaId: consumedState.empresaId,
    usuarioId: consumedState.usuarioId,
    accessToken: tokenResponse.access_token,
    numeros,
    expiraEn,
  };

  return {
    numeros,
    // Cifra el payload COMPLETO (incluido el access token en claro) — nunca
    // sale un access token en claro por HTTP, ni siquiera hacia el propio
    // frontend que lo reenvía sin poder leerlo.
    seleccion: encrypt(JSON.stringify(payload)),
    expiraEn: new Date(expiraEn).toISOString(),
  };
}

/** `GET /whatsapp/conexion` (ADMINISTRADOR) — estado actual de la conexión de la empresa, o `null` si nunca se conectó. */
export async function getWhatsAppConexion(empresaId: string): Promise<WhatsAppConexionDto | null> {
  const conexion = await whatsappConexionRepository.findByEmpresaId(empresaId);
  return conexion ? toDto(conexion) : null;
}

function toDto(conexion: WhatsAppConexionSafe): WhatsAppConexionDto {
  return {
    id: conexion.id,
    empresaId: conexion.empresaId,
    numeroTelefonoId: conexion.numeroTelefonoId,
    numeroDisplay: conexion.numeroDisplay,
    wabaId: conexion.wabaId,
    estado: conexion.estado,
    creadoEn: conexion.creadoEn.toISOString(),
  };
}

/**
 * `POST /whatsapp/conexion` (ADMINISTRADOR) — decide la empresa destino con
 * el mismo criterio D9/D10 que `asignacion.service.ts::resolveReceptor`: un
 * actor scoped a una empresa (`usuario.empresaId !== null`) siempre usa la
 * suya, ignorando `body.empresaId`; solo un actor holding-wide
 * (`usuario.empresaId === null`, mismo criterio que ADMINISTRADOR/SUPERVISOR
 * en el resto del sistema — rule 4) puede indicar una empresa distinta, y
 * debe coincidir con la empresa para la que se inició el flujo OAuth
 * (`payload.empresaId`, D-mensajería: nadie completa el flujo de otra
 * empresa con su propia sesión).
 */
export async function createWhatsAppConexion(
  usuario: { id: string; empresaId: string | null },
  body: WhatsAppConexionBody,
): Promise<WhatsAppConexionDto> {
  let payload: SeleccionPayload;
  try {
    payload = JSON.parse(decrypt(body.seleccion)) as SeleccionPayload;
  } catch {
    throw seleccionInvalida();
  }

  if (typeof payload.expiraEn !== "number" || Date.now() > payload.expiraEn) {
    throw seleccionInvalida();
  }

  const empresaObjetivo = usuario.empresaId ?? body.empresaId;
  if (!empresaObjetivo) {
    throw new AppError("whatsapp_empresa_requerida", 400, "Debes indicar la empresa destino");
  }
  if (empresaObjetivo !== payload.empresaId) throw seleccionInvalida();

  const numero = payload.numeros.find((n) => n.numeroTelefonoId === body.numeroTelefonoId);
  if (!numero) {
    throw new AppError(
      "whatsapp_numero_invalido",
      422,
      "El número indicado no está entre los descubiertos para esta cuenta",
    );
  }

  const conexion = await whatsappConexionRepository.upsertConexion({
    empresaId: payload.empresaId,
    numeroTelefonoId: numero.numeroTelefonoId,
    numeroDisplay: numero.numeroDisplay,
    wabaId: numero.wabaId,
    tokenCifrado: encrypt(payload.accessToken),
    // Los tokens de sistema/larga duración de Embedded Signup no reportan
    // `expires_in` en este intercambio (a diferencia del token corto inicial
    // de `code`) — `null` es el estado correcto, no un valor por defecto
    // olvidado (mismo campo nullable en el schema: `tokenExpiraEn DateTime?`).
    tokenExpiraEn: null,
  });

  return toDto(conexion);
}
