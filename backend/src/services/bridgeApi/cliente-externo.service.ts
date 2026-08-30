import {
  NOMBRE_HEADER_API_KEY_DEFAULT,
  type ConfiguracionBridgeApi,
} from "../../types/bridgeApi/configuracion-bridge-api.js";

export type RespuestaApiExterna =
  | { ok: true; leads: unknown[] }
  | { ok: false; mensaje: string };

/**
 * bridgeApi: GET real contra la API del cliente, con la credencial en el
 * header configurado (`nombreHeaderApiKey`, default `X-Api-Key`) y el
 * parámetro de fecha configurado (`parametroFecha`) si hay `desde` y el
 * bridge lo soporta. Un solo intento, sin reintento/backoff — mismo criterio
 * que `meta-token.service.ts::verificarTokenPagina` para llamadas
 * disparadas por un administrador en vivo (prueba de conexión), no por un
 * webhook que no puede perder datos.
 *
 * Nunca confía en la forma del payload externo (AGENTS.md §4.4): valida que
 * la raíz sea un array antes de devolverlo — el mapeo campo por campo
 * (`adapters/bridgeApi/api-externa.adapter.ts`) lo hace el caller.
 */
export async function consultarLeadsExternos(
  configuracion: Pick<ConfiguracionBridgeApi, "url" | "parametroFecha" | "nombreHeaderApiKey">,
  credencial: string,
  desde?: Date,
): Promise<RespuestaApiExterna> {
  const url = new URL(configuracion.url);
  if (configuracion.parametroFecha && desde) {
    url.searchParams.set(configuracion.parametroFecha, desde.toISOString());
  }

  const nombreHeader = configuracion.nombreHeaderApiKey ?? NOMBRE_HEADER_API_KEY_DEFAULT;

  let respuesta: Response;
  let cuerpo: unknown;
  try {
    respuesta = await fetch(url, { headers: { [nombreHeader]: credencial } });
    cuerpo = await respuesta.json().catch(() => null);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error de red desconocido";
    return { ok: false, mensaje: `Error al consultar la API externa: ${mensaje}` };
  }

  if (!respuesta.ok) {
    return { ok: false, mensaje: `La API externa respondió HTTP ${respuesta.status}` };
  }

  if (!Array.isArray(cuerpo)) {
    return { ok: false, mensaje: "La API externa no devolvió un array JSON en la raíz" };
  }

  return { ok: true, leads: cuerpo };
}
