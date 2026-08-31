/**
 * Tipos compartidos con el backend para LinkedIn Lead Sync -- ver
 * `docs/contrato-frontend-linkedin-api_mat_05.md`. A diferencia de WhatsApp,
 * LinkedIn SÍ es un `Bridge` (`redSocial: "LINKEDIN"`, `tipos/bridge.ts`):
 * la conexión OAuth y las fuentes de acá cuelgan de un `Bridge` ya creado,
 * no reemplazan el modelo `CuentaPublicitariaBridge` (que sigue siendo
 * exclusivo de Facebook/Instagram -- ver `bridges/catalogos.ts`).
 */

export type EstadoLinkedInConexion = "ACTIVA" | "TOKEN_EXPIRADO" | "REVOCADA" | "ERROR";

/**
 * Forma exacta del objeto `conexion` (contrato, pasos 2 y 3). El token en sí
 * -- ni cifrado ni en claro -- NUNCA aparece acá (contrato, paso 2).
 */
export interface LinkedInConexion {
  id: string;
  bridgeId: string;
  estado: EstadoLinkedInConexion;
  accessTokenExpiraEn: string;
  refreshTokenExpiraEn: string | null;
  scopes: string[];
  tieneRefreshToken: boolean;
  fuentes: LinkedInFuente[];
}

export type LinkedInFuenteTipo = "SPONSORED_ACCOUNT" | "ORGANIZATION";
export type LinkedInFuenteTipoLead = "SPONSORED" | "EVENT" | "COMPANY" | "ORGANIZATION_PRODUCT";
export type LinkedInFuenteEstadoSuscripcion = "PENDIENTE" | "ACTIVA" | "ERROR" | "REVOCADA";

/** Forma exacta de una fuente (contrato, pasos 5-7). `subscriptionId` nunca viaja acá (contrato, paso 7). */
export interface LinkedInFuente {
  id: string;
  tipo: LinkedInFuenteTipo;
  ownerUrn: string;
  nombre: string | null;
  tipoLead: LinkedInFuenteTipoLead;
  activa: boolean;
  estadoSuscripcion: LinkedInFuenteEstadoSuscripcion;
  ultimaSincronizacionEn: string | null;
}
