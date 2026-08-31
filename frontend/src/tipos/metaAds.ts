/**
 * Tipos compartidos con el backend para el flujo de conexión de Meta Ads
 * (Marketing/Insights API de una cuenta de anuncios) -- ver
 * `backend/src/types/metaAds/meta-ads-oauth.dto.ts`. A diferencia de
 * WhatsApp, esta NO es una fuente de leads (no es un `Bridge`): es una
 * conexión OAuth por empresa para traer métricas reales de campañas
 * (CPC/CPL/CAC) al Dashboard.
 */

/** Una cuenta de anuncios descubierta en el Paso 2 (`GET /meta-ads/callback`). */
export interface MetaAdsCuentaDescubierta {
  cuentaAnunciosIdExterno: string;
  nombre: string;
  moneda: string | null;
  zonaHoraria: string | null;
}

/** Estado de una `CuentaAnunciosConexion` ya persistida (Paso 3, `POST /meta-ads/conexion`). */
export type EstadoMetaAdsConexion = "ACTIVA" | "TOKEN_EXPIRADO" | "ERROR" | "INACTIVA";

/**
 * Forma exacta del objeto `conexion` devuelto por el Paso 3/Paso 4. El token
 * de acceso NUNCA aparece acá -- ni cifrado ni en claro (mismo criterio que
 * `WhatsAppConexion`, ver `cuenta-anuncios-conexion.repository.ts::
 * CUENTA_ANUNCIOS_CONEXION_SAFE_SELECT`).
 */
export interface MetaAdsConexion {
  id: string;
  empresaId: string;
  cuentaAnunciosIdExterno: string;
  nombre: string;
  moneda: string | null;
  zonaHoraria: string | null;
  estado: EstadoMetaAdsConexion;
  tokenExpiraEn: string | null;
  ultimaSincronizacionEn: string | null;
  ultimoError: string | null;
  creadoEn: string;
  actualizadoEn: string;
}
