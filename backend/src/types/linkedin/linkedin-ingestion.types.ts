import type { LinkedInLeadType, LinkedInSourceType } from "./linkedin.dto.js";

export interface PersistedLinkedInPendienteDetalleV3 {
  version: 3;
  tipo: "LINKEDIN_PENDIENTE_DETALLE";
  recibidoEn: string;
  notificationId: string;
  leadFormResponseId: string;
  ownerUrn: string;
  versionedFormUrn: string;
}

export interface LinkedInResolvedSourceContext {
  bridgeId: string;
  fuenteId: string;
  ownerUrn: string;
  tipoFuente: LinkedInSourceType;
  tipoLead: LinkedInLeadType;
  cuentaPublicitariaId: string | null;
}

export interface LinkedInLeadContext extends LinkedInResolvedSourceContext {
  recibidoEn: Date;
  notificationId: string | null;
  campaignUrn: string | null;
  campaignName: string | null;
}
