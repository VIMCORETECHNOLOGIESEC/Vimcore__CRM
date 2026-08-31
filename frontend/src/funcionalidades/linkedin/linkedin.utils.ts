/**
 * Utilidades del flujo OAuth de LinkedIn Lead Sync (ver
 * `docs/contrato-frontend-linkedin-api_mat_05.md`, pasos 1-3).
 *
 * El Paso 1 y el Paso 2 están separados por una navegación completa del
 * navegador (LinkedIn redirige de verdad, no es un fetch) -- todo estado en
 * memoria de React (incluido qué `Bridge` originó la conexión) se pierde
 * entre medio. `sessionStorage` sobrevive esa navegación dentro de la misma
 * pestaña y se limpia sola al usarse, mismo criterio que
 * `whatsapp/whatsapp.utils.ts::guardarEmpresaFlujo`/`leerYLimpiarEmpresaFlujo`.
 *
 * A diferencia de WhatsApp (que no puede saber a qué empresa volver en caso
 * de error, porque el Paso 2 no la devuelve), LinkedIn SÍ devuelve
 * `conexion.bridgeId` en el camino exitoso -- pero en un camino de ERROR
 * (`linkedin_oauth_cancelado`, `linkedin_oauth_state_invalido`, etc.) no hay
 * ningún `conexion` de la cual leerlo. Por eso igual se persiste acá: es la
 * única fuente confiable de "a qué bridge volver" en AMBOS casos, no solo el
 * de éxito.
 */
const BRIDGE_ID_FLUJO_STORAGE_KEY = "crm.linkedin.bridgeIdFlujo";

/** Persiste el `bridgeId` que inició el Paso 1, antes de redirigir a LinkedIn. */
export function guardarBridgeIdFlujo(bridgeId: string): void {
  try {
    sessionStorage.setItem(BRIDGE_ID_FLUJO_STORAGE_KEY, bridgeId);
  } catch {
    // sessionStorage no disponible (modo privado estricto de algunos
    // navegadores) -- el callback sigue mostrando éxito/error igual, solo
    // pierde el link directo de "volver al bridge" (cae al listado general
    // de bridges). Mismo criterio de degradación que `api/httpClient.ts`.
  }
}

/** Lee y limpia el `bridgeId` guardado por el Paso 1 -- se consume una única vez. */
export function leerYLimpiarBridgeIdFlujo(): string | undefined {
  try {
    const valor = sessionStorage.getItem(BRIDGE_ID_FLUJO_STORAGE_KEY);
    sessionStorage.removeItem(BRIDGE_ID_FLUJO_STORAGE_KEY);
    return valor ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Redirige el navegador de verdad (no es un fetch) -- el Paso 1 exige abrir
 * `authorizationUrl` de LinkedIn en la misma pestaña. Envuelto en su propia
 * función para poder mockearlo en tests sin pelear con la navegación real de
 * jsdom (mismo criterio que `whatsapp/whatsapp.utils.ts::redirigirA`).
 */
export function redirigirA(url: string): void {
  window.location.assign(url);
}
