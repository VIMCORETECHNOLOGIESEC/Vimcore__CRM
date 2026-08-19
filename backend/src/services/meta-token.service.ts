import { z } from "zod";
import { env } from "../config/env.js";
import { GRAPH_API_BASE_URL } from "./meta-webhook.service.js";

/**
 * `GET /debug_token` (docs/05-bridges.md §3, §7) — Graph API responde 200
 * incluso para un token inválido/revocado (`data.is_valid: false`), así como
 * puede rechazar la request completa con un HTTP no-2xx (App Access Token mal
 * formado, App ID/Secret incorrectos, etc). Se valida la forma igual que
 * `metaLeadgenDetalleSchema` (AGENTS.md §4.4, "nunca confiar en el payload de
 * una API externa").
 */
const debugTokenResponseSchema = z.object({
  data: z.object({
    is_valid: z.boolean(),
    expires_at: z.number().optional(),
    error: z.object({ message: z.string().optional() }).optional(),
  }),
});

export type VerificacionTokenPagina =
  | { valido: true; expiraEn: Date | null }
  | { valido: false; mensaje: string };

/**
 * Verifica el Page Access Token de una Página de Meta contra `/debug_token`
 * (docs/05-bridges.md §3, §7). Un solo intento, sin reintento/backoff: a
 * diferencia de `meta-webhook.service.ts::consultarDetalleLead` (disparado
 * por un webhook entrante que no puede perder datos), esta función la
 * dispara un administrador en vivo (carga de token / prueba de conexión) o
 * el trabajo programado diario (que ya reintenta naturalmente al día
 * siguiente) — no hace falta el mismo presupuesto de reintentos.
 *
 * `access_token=<APP_ID>|<APP_SECRET>` es el App Access Token que Graph API
 * exige para poder inspeccionar el `input_token` de un tercero (el Page
 * Access Token cifrado en `CuentaPublicitaria.tokenCifrado`).
 */
export async function verificarTokenPagina(token: string): Promise<VerificacionTokenPagina> {
  const appAccessToken = `${env.META_APP_ID}|${env.META_APP_SECRET}`;
  const url =
    `${GRAPH_API_BASE_URL}/debug_token?input_token=${encodeURIComponent(token)}` +
    `&access_token=${encodeURIComponent(appAccessToken)}`;

  let respuesta: Response;
  let cuerpo: unknown;
  try {
    respuesta = await fetch(url);
    cuerpo = await respuesta.json().catch(() => null);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error de red desconocido";
    return { valido: false, mensaje: `Error al consultar /debug_token: ${mensaje}` };
  }

  if (!respuesta.ok) {
    const mensajeError = (cuerpo as { error?: { message?: string } } | null)?.error?.message?.trim();
    return {
      valido: false,
      mensaje: mensajeError ? mensajeError : `Graph API respondió HTTP ${respuesta.status}`,
    };
  }

  const parsed = debugTokenResponseSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return { valido: false, mensaje: "Graph API devolvió una respuesta con forma inesperada" };
  }

  const { data } = parsed.data;
  if (!data.is_valid) {
    const mensajeError = data.error?.message?.trim();
    return {
      valido: false,
      mensaje: mensajeError ? mensajeError : "El token no es válido según Graph API",
    };
  }

  // `expires_at === 0` (o ausente) significa "no expira" para un Page Token
  // de larga duración (Graph API reference) — nunca se traduce a un valor de
  // fecha inválido (`new Date(0)` sería 1970).
  const expiraEn = data.expires_at !== undefined && data.expires_at > 0
    ? new Date(data.expires_at * 1000)
    : null;

  return { valido: true, expiraEn };
}
