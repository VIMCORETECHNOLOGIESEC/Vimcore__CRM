export type LinkedInConnectionState = "ACTIVA" | "TOKEN_EXPIRADO" | "REVOCADA" | "ERROR";

export type LinkedInSourceType = "SPONSORED_ACCOUNT" | "ORGANIZATION";

export type LinkedInLeadType = "SPONSORED" | "EVENT" | "COMPANY" | "ORGANIZATION_PRODUCT";

export type LinkedInSubscriptionState = "PENDIENTE" | "ACTIVA" | "ERROR" | "REVOCADA";

export interface LinkedInOAuthStartDto {
  authorizationUrl: string;
  expiraEn: string;
}

export interface LinkedInConexionDto {
  id: string;
  bridgeId: string;
  estado: LinkedInConnectionState;
  accessTokenExpiraEn: string;
  refreshTokenExpiraEn: string | null;
  scopes: string[];
  tieneRefreshToken: boolean;
  fuentes: LinkedInFuenteDto[];
}

export interface LinkedInFuenteDto {
  id: string;
  tipo: LinkedInSourceType;
  ownerUrn: string;
  nombre: string;
  tipoLead: LinkedInLeadType;
  activa: boolean;
  estadoSuscripcion: LinkedInSubscriptionState;
  ultimaSincronizacionEn: string | null;
}
