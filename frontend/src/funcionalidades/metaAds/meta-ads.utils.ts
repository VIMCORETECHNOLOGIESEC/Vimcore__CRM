/**
 * Utilidades del flujo de conexión de Meta Ads -- mismo criterio que
 * `whatsapp/whatsapp.utils.ts`.
 *
 * El flujo son tres pasos ENCADENADOS pero separados por una navegación
 * completa del navegador (Meta redirige de verdad, no es un fetch) -- todo
 * estado en memoria de React (incluido `empresaId`, para el caso
 * holding-wide que el Paso 1 resolvió antes de salir hacia Meta) se pierde
 * entre el Paso 1 y el Paso 2/3. `sessionStorage` sobrevive esa navegación
 * dentro de la misma pestaña y se limpia sola al usarse, sin dejar rastro
 * sensible (`empresaId` no es un secreto).
 */
const EMPRESA_FLUJO_STORAGE_KEY = "crm.metaAds.empresaIdFlujo";

/**
 * Persiste el `empresaId` elegido en el Paso 1 antes de redirigir a Meta
 * (solo aplica a un actor holding-wide -- ver
 * `meta-ads.api.ts::iniciarConexionMetaAdsApi`). Con `undefined` (actor de
 * sesión `company`), limpia cualquier valor previo en vez de guardar nada.
 */
export function guardarEmpresaFlujo(empresaId: string | undefined): void {
  try {
    if (empresaId) {
      sessionStorage.setItem(EMPRESA_FLUJO_STORAGE_KEY, empresaId);
    } else {
      sessionStorage.removeItem(EMPRESA_FLUJO_STORAGE_KEY);
    }
  } catch {
    // sessionStorage no disponible (modo privado estricto de algunos
    // navegadores) -- el Paso 3 sigue funcionando para una sesión `company`
    // (no necesita `empresaId`); una sesión `holding` simplemente no podrá
    // completar la conexión sin volver a elegir empresa desde el Paso 1.
    // Mismo criterio de degradación que `api/httpClient.ts`.
  }
}

/**
 * Lee y limpia el `empresaId` guardado por el Paso 1 -- se consume una única
 * vez, mismo criterio que la `seleccion` de un solo uso que devuelve el
 * backend en el Paso 2.
 */
export function leerYLimpiarEmpresaFlujo(): string | undefined {
  try {
    const valor = sessionStorage.getItem(EMPRESA_FLUJO_STORAGE_KEY);
    sessionStorage.removeItem(EMPRESA_FLUJO_STORAGE_KEY);
    return valor ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Redirige el navegador de verdad (no es un fetch) -- fallback cuando el
 * navegador bloquea el popup del Paso 1.
 */
export function redirectTo(url: string): void {
  window.location.assign(url);
}
