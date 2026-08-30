import { httpClient } from "@/api/httpClient";
import type { WhatsAppConexion, WhatsAppNumero } from "@/tipos/whatsapp";

/**
 * Capa de datos del flujo de conexión de WhatsApp Business (Embedded Signup
 * de Meta) -- backend real, contrato verificado en
 * `docs/contrato-frontend-whatsapp-api_mat_04.md`, secciones 1-3. Solo el
 * flujo de conexión: mensajería/conversaciones (secciones 4-6) queda fuera
 * de este módulo, es otra tarea.
 *
 * `httpClient` ya mapea errores del backend (`{ code, message }`) a
 * `ApiError` -- las excepciones se propagan tal cual, sin envolverlas de
 * nuevo (mismo patrón que `bridges/bridges.api.ts`).
 */

export interface IniciarConexionWhatsAppResponse {
  authorizationUrl: string;
  expiraEn: string;
}

/**
 * Paso 1 (`GET /whatsapp/conectar`, rol ADMINISTRADOR). `empresaId` solo
 * aplica a un actor holding-wide -- para un actor de sesión `company` el
 * backend lo ignora, así que acá se manda `undefined` (se omite de la query
 * real, ver `httpClient.ts::buildQueryString`).
 */
export async function iniciarConexionWhatsAppApi(
  empresaId: string | undefined,
): Promise<IniciarConexionWhatsAppResponse> {
  return httpClient.get<IniciarConexionWhatsAppResponse>("/whatsapp/conectar", {
    params: { empresaId },
  });
}

export interface WhatsAppCallbackParams {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export interface WhatsAppCallbackResponse {
  numeros: WhatsAppNumero[];
  /** Blob opaco cifrado (AES-256-GCM) -- reenviar tal cual al Paso 3, nunca leerlo ni alterarlo. */
  seleccion: string;
  expiraEn: string;
}

/**
 * Paso 2 (`GET /whatsapp/callback`) -- **público**, sin `Authorization`
 * (`skipAuth`): Meta redirige acá el navegador del administrador, la
 * identidad se recupera del `state`, no de un JWT (contrato, sección 2).
 * Reenvía `code`/`state` o `error`/`error_description`/`state` tal cual
 * llegaron en la URL -- nunca decide del lado del cliente cuál de las dos
 * formas es, eso lo valida el backend.
 */
export async function fetchWhatsAppCallbackApi(
  params: WhatsAppCallbackParams,
): Promise<WhatsAppCallbackResponse> {
  return httpClient.get<WhatsAppCallbackResponse>("/whatsapp/callback", {
    skipAuth: true,
    params: {
      code: params.code,
      state: params.state,
      error: params.error,
      error_description: params.errorDescription,
    },
  });
}

export interface CompletarConexionWhatsAppInput {
  /** El blob devuelto tal cual por el Paso 2 -- nunca se parsea ni se altera. */
  seleccion: string;
  numeroTelefonoId: string;
  /** Solo si el actor es holding-wide; debe coincidir con la empresa del Paso 1. */
  empresaId?: string;
}

interface CompletarConexionWhatsAppResponse {
  conexion: WhatsAppConexion;
}

/**
 * Paso 3 (`POST /whatsapp/conexion`, rol ADMINISTRADOR) -- recién acá se
 * persiste la `WhatsAppConexion`, el Paso 2 nunca conecta automático
 * (contrato, sección 3).
 */
export async function completarConexionWhatsAppApi(
  input: CompletarConexionWhatsAppInput,
): Promise<WhatsAppConexion> {
  const { conexion } = await httpClient.post<CompletarConexionWhatsAppResponse>(
    "/whatsapp/conexion",
    input,
  );
  return conexion;
}
