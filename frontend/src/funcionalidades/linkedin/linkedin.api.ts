import { httpClient } from "@/api/httpClient";
import type { LinkedInConexion, LinkedInFuente } from "@/tipos/linkedin";

/**
 * Capa de datos de LinkedIn Lead Sync -- backend real, contrato verificado
 * en `docs/contrato-frontend-linkedin-api_mat_05.md`. Todos los endpoints
 * (salvo el callback, público) exigen `Authorization` de un `ADMINISTRADOR`
 * y cuelgan de un `Bridge` ya creado con `redSocial: "LINKEDIN"`.
 *
 * `httpClient` ya mapea errores del backend (`{ code, message }`) a
 * `ApiError` -- las excepciones se propagan tal cual, sin envolverlas de
 * nuevo (mismo patrón que `bridges/bridges.api.ts`/`whatsapp/whatsapp.api.ts`).
 */

export interface IniciarOAuthLinkedInResponse {
  authorizationUrl: string;
  expiraEn: string;
}

/** Paso 1 (`POST /bridges/:id/linkedin/oauth/iniciar`). */
export async function iniciarOAuthLinkedInApi(bridgeId: string): Promise<IniciarOAuthLinkedInResponse> {
  return httpClient.post<IniciarOAuthLinkedInResponse>(`/bridges/${bridgeId}/linkedin/oauth/iniciar`);
}

export interface LinkedInCallbackParams {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

interface LinkedInConexionResponse {
  conexion: LinkedInConexion;
}

/**
 * Paso 2 (`GET /integraciones/linkedin/oauth/callback`) -- **público**, sin
 * `Authorization` (`skipAuth`): LinkedIn redirige acá el navegador del
 * administrador, la identidad viaja en el `state` (contrato, paso 2).
 * Reenvía `code`/`state` o `error`/`error_description`/`state` tal cual
 * llegaron en la URL -- nunca decide del lado del cliente cuál de las dos
 * formas es, eso lo valida el backend.
 */
export async function fetchLinkedInCallbackApi(
  params: LinkedInCallbackParams,
): Promise<LinkedInConexion> {
  const { conexion } = await httpClient.get<LinkedInConexionResponse>(
    "/integraciones/linkedin/oauth/callback",
    {
      skipAuth: true,
      params: {
        code: params.code,
        state: params.state,
        error: params.error,
        error_description: params.errorDescription,
      },
    },
  );
  return conexion;
}

/** Paso 3 (`GET /bridges/:id/linkedin/conexion`) -- `null` si nunca se completó el OAuth. */
export async function fetchLinkedInConexionApi(bridgeId: string): Promise<LinkedInConexion | null> {
  const { conexion } = await httpClient.get<{ conexion: LinkedInConexion | null }>(
    `/bridges/${bridgeId}/linkedin/conexion`,
  );
  return conexion;
}

export interface ProbarConexionLinkedInResponse {
  conectado: boolean;
  verificadoEn: string;
}

/** Paso 4 (`POST /bridges/:id/linkedin/probar-conexion`) -- puramente diagnóstico, nunca cambia el estado guardado. */
export async function probarConexionLinkedInApi(
  bridgeId: string,
): Promise<ProbarConexionLinkedInResponse> {
  return httpClient.post<ProbarConexionLinkedInResponse>(
    `/bridges/${bridgeId}/linkedin/probar-conexion`,
  );
}

/** Paso 5 (`GET /bridges/:id/linkedin/fuentes`). */
export async function fetchLinkedInFuentesApi(bridgeId: string): Promise<LinkedInFuente[]> {
  const { fuentes } = await httpClient.get<{ fuentes: LinkedInFuente[] }>(
    `/bridges/${bridgeId}/linkedin/fuentes`,
  );
  return fuentes;
}

/**
 * Paso 6 (`POST /bridges/:id/linkedin/fuentes/descubrir`) -- consulta
 * LinkedIn en vivo y hace upsert local; nunca activa una fuente
 * automáticamente ni pisa una activación/suscripción ya existente (contrato,
 * paso 6).
 */
export async function descubrirFuentesLinkedInApi(bridgeId: string): Promise<LinkedInFuente[]> {
  const { fuentes } = await httpClient.post<{ fuentes: LinkedInFuente[] }>(
    `/bridges/${bridgeId}/linkedin/fuentes/descubrir`,
  );
  return fuentes;
}

/**
 * Paso 7 (`PATCH /bridges/:id/linkedin/fuentes/:fuenteId`) -- NO es
 * optimista: activar suscribe de verdad a `leadNotifications` en LinkedIn,
 * desactivar desuscribe; el estado local devuelto solo cambia después de la
 * confirmación (o falla) real de LinkedIn (contrato, paso 7).
 */
export async function toggleFuenteLinkedInApi(
  bridgeId: string,
  fuenteId: string,
  activa: boolean,
): Promise<LinkedInFuente> {
  const { fuente } = await httpClient.patch<{ fuente: LinkedInFuente }>(
    `/bridges/${bridgeId}/linkedin/fuentes/${fuenteId}`,
    { activa },
  );
  return fuente;
}
