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

/**
 * GAP DE CONTRATO CONFIRMADO (integración bridges.api.ts, 2026-08-19): el
 * endpoint real `POST /bridges/:id/cuentas/:cuentaId/token` (y su
 * `probar-conexion`) solo verifica contra Graph API de Meta
 * (`backend/src/services/meta-token.service.ts::verificarTokenPagina`,
 * `/debug_token`) -- no existe ningún adaptador OAuth de LinkedIn del lado
 * del servidor todavía, aunque `ESTILO_AUTENTICACION_POR_RED` clasifique a
 * LinkedIn como `TOKEN_PROVEEDOR` igual que Facebook/Instagram. Llamar a ese
 * endpoint para una cuenta de LinkedIn invocaría por error la verificación
 * de Meta. Por eso las cuentas de redes en esta lista muestran el formulario
 * de token funcional (`TokenForm`/`PruebaConexionBoton`) por fila
 * (`CuentasPublicitariasList.tsx`); el resto de las redes `TOKEN_PROVEEDOR`
 * (hoy solo LinkedIn) sigue mostrando el aviso "Fase 2 · Proveedor OAuth no
 * conectado todavía" sin ofrecer un formulario interactivo.
 */
export const REDES_CON_INTEGRACION_TOKEN_CONECTADA: RedSocial[] = ["FACEBOOK", "INSTAGRAM"];

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
