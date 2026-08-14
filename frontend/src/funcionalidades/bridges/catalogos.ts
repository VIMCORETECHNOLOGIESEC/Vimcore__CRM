import type { RedSocial } from "@/tipos/lead";
import type { EstadoBridge, EstiloAutenticacionBridge, NivelBridgeLog } from "@/tipos/bridge";

/** Reexportado desde `leads/catalogos.ts` -- mismo catálogo `RedSocial` (docs/03), sin duplicarlo. */
export { RED_SOCIAL_ETIQUETAS } from "@/funcionalidades/leads/catalogos";

/**
 * Estilo de autenticación por red social (bridge-lifecycle-management,
 * Requirement: Credential Form Branches by Authentication Style). Google
 * Forms y X se autentican con una clave de API generada por el servidor;
 * Facebook, Instagram y LinkedIn usan el flujo OAuth existente (Fase 2 --
 * ver `CredencialBridgeForm.tsx`).
 */
export const ESTILO_AUTENTICACION_POR_RED: Record<RedSocial, EstiloAutenticacionBridge> = {
  GOOGLE_FORMS: "CLAVE_API",
  X: "CLAVE_API",
  FACEBOOK: "TOKEN_PROVEEDOR",
  INSTAGRAM: "TOKEN_PROVEEDOR",
  LINKEDIN: "TOKEN_PROVEEDOR",
};

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
