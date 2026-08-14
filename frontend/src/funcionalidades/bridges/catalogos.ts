import type { EstadoBridge, NivelBridgeLog } from "@/tipos/bridge";

/** Reexportado desde `leads/catalogos.ts` -- mismo catálogo `RedSocial` (docs/03), sin duplicarlo. */
export { RED_SOCIAL_ETIQUETAS } from "@/funcionalidades/leads/catalogos";

export const ESTADO_BRIDGE_ETIQUETAS: Record<EstadoBridge, string> = {
  ACTIVO: "Activo",
  TOKEN_EXPIRADO: "Token expirado",
  ERROR: "Error",
  INACTIVO: "Inactivo",
};

export const NIVEL_LOG_ETIQUETAS: Record<NivelBridgeLog, string> = {
  INFO: "Información",
  ADVERTENCIA: "Advertencia",
  ERROR: "Error",
};
