import { httpClient } from "@/api/httpClient";
import type { MetaAdsConexion, MetaAdsCuentaDescubierta } from "@/tipos/metaAds";

/**
 * Capa de datos del flujo de conexión de Meta Ads -- backend real, contrato
 * verificado en `backend/src/controllers/metaAds/meta-ads.controller.ts` y
 * `backend/src/services/metaAds/meta-ads-oauth.service.ts`. Mismo patrón que
 * `whatsapp/whatsapp.api.ts`, con la diferencia de forma que exige el Paso 3
 * acá (se elige una CUENTA de anuncios, no un número).
 *
 * `httpClient` ya mapea errores del backend (`{ code, message }`) a
 * `ApiError` -- las excepciones se propagan tal cual, sin envolverlas de
 * nuevo.
 */

export interface IniciarConexionMetaAdsResponse {
  authorizationUrl: string;
  expiraEn: string;
}

/**
 * Paso 1 (`GET /meta-ads/conectar`, rol ADMINISTRADOR). `empresaId` solo
 * aplica a un actor holding-wide -- para un actor de sesión `company` el
 * backend lo ignora, así que acá se manda `undefined` (se omite de la query
 * real, ver `httpClient.ts::buildQueryString`).
 */
export async function iniciarConexionMetaAdsApi(
  empresaId: string | undefined,
): Promise<IniciarConexionMetaAdsResponse> {
  return httpClient.get<IniciarConexionMetaAdsResponse>("/meta-ads/conectar", {
    params: { empresaId },
  });
}

export interface MetaAdsCallbackParams {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export interface MetaAdsCallbackResponse {
  cuentas: MetaAdsCuentaDescubierta[];
  /** Blob opaco cifrado (AES-256-GCM) -- reenviar tal cual al Paso 3, nunca leerlo ni alterarlo. */
  seleccion: string;
  expiraEn: string;
}

/**
 * Paso 2 (`GET /meta-ads/callback`) -- **público**, sin `Authorization`
 * (`skipAuth`): Meta redirige acá el navegador del administrador, la
 * identidad se recupera del `state`, no de un JWT. Reenvía `code`/`state` o
 * `error`/`error_description`/`state` tal cual llegaron en la URL -- nunca
 * decide del lado del cliente cuál de las dos formas es, eso lo valida el
 * backend (`metaAdsOAuthCallbackQuerySchema`).
 */
export async function fetchMetaAdsCallbackApi(
  params: MetaAdsCallbackParams,
): Promise<MetaAdsCallbackResponse> {
  return httpClient.get<MetaAdsCallbackResponse>("/meta-ads/callback", {
    skipAuth: true,
    params: {
      code: params.code,
      state: params.state,
      error: params.error,
      error_description: params.errorDescription,
    },
  });
}

export interface CompletarConexionMetaAdsInput {
  /** El blob devuelto tal cual por el Paso 2 -- nunca se parsea ni se altera. */
  seleccion: string;
  /** Formato `act_<id>` -- exigido tal cual por `metaAdsConexionBodySchema`. */
  cuentaAnunciosIdExterno: string;
  /** Solo si el actor es holding-wide; debe coincidir con la empresa del Paso 1. */
  empresaId?: string;
}

interface CompletarConexionMetaAdsResponse {
  conexion: MetaAdsConexion;
}

/**
 * Paso 3 (`POST /meta-ads/conexion`, rol ADMINISTRADOR) -- recién acá se
 * persiste la `CuentaAnunciosConexion`, el Paso 2 nunca conecta automático
 * (mismo criterio que WhatsApp).
 */
export async function completarConexionMetaAdsApi(
  input: CompletarConexionMetaAdsInput,
): Promise<MetaAdsConexion> {
  const { conexion } = await httpClient.post<CompletarConexionMetaAdsResponse>(
    "/meta-ads/conexion",
    input,
  );
  return conexion;
}

interface MetaAdsConexionStatusResponse {
  conexion: MetaAdsConexion | null;
}

/**
 * Paso 4 (`GET /meta-ads/conexion`, rol ADMINISTRADOR) -- estado REAL actual
 * de la conexión de la empresa (`null` si nunca se conectó). Misma
 * resolución de empresa destino que el Paso 1. Usado por el flujo de popup
 * (`useOAuthPopup`, `useMetaAds.ts`) para confirmar el resultado real
 * después de que la ventana emergente se cierra, en vez de asumir éxito o
 * cancelación por el solo hecho de que se cerró.
 */
export async function fetchMetaAdsConexionApi(
  empresaId: string | undefined,
): Promise<MetaAdsConexion | null> {
  const { conexion } = await httpClient.get<MetaAdsConexionStatusResponse>(
    "/meta-ads/conexion",
    { params: { empresaId } },
  );
  return conexion;
}
