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
  API_EXTERNA: "CLAVE_API",
};

/**
 * GAP DE CONTRATO CONFIRMADO (integración bridges.api.ts, 2026-08-19): el
 * endpoint real `POST /bridges/:id/cuentas/:cuentaId/token` (y su
 * `probar-conexion`) solo verifica contra Graph API de Meta
 * (`backend/src/services/meta-token.service.ts::verificarTokenPagina`,
 * `/debug_token`) -- esto NUNCA aplicó a LinkedIn, aunque
 * `ESTILO_AUTENTICACION_POR_RED` lo clasifique como `TOKEN_PROVEEDOR` igual
 * que Facebook/Instagram. Llamar a ese endpoint para una cuenta de LinkedIn
 * invocaría por error la verificación de Meta. Por eso las cuentas de redes
 * en esta lista muestran el formulario de token funcional
 * (`TokenForm`/`PruebaConexionBoton`) por fila (`CuentasPublicitariasList.tsx`).
 *
 * ACTUALIZACIÓN: LinkedIn Lead Sync sí tiene un adaptador OAuth real del
 * lado del servidor ahora (`docs/contrato-frontend-linkedin-api_mat_05.md`)
 * -- pero es un mecanismo DISTINTO al de esta lista, bridge-scoped en vez de
 * cuenta-publicitaria-scoped (LinkedIn no tiene `CuentaPublicitariaBridge`).
 * `BridgeDetallePage.tsx` ya no delega a `CuentasPublicitariasList` para un
 * bridge LinkedIn -- ver `funcionalidades/linkedin/LinkedInIntegracionSection.tsx`.
 * `REDES_CON_INTEGRACION_TOKEN_CONECTADA` sigue sin incluir LinkedIn a
 * propósito: sigue siendo cierto que no tiene un adaptador de ESTE modelo
 * (cuenta publicitaria); el resto de las redes `TOKEN_PROVEEDOR` sin
 * cuentas publicitarias reales (hoy ninguna más) seguiría mostrando el
 * aviso "Fase 2 · Proveedor OAuth no conectado todavía" si alguna vez
 * llegara a tener cuentas asociadas.
 */
export const REDES_CON_INTEGRACION_TOKEN_CONECTADA: RedSocial[] = ["FACEBOOK", "INSTAGRAM"];

export const ESTADO_BRIDGE_ETIQUETAS: Record<EstadoBridge, string> = {
  ACTIVO: "Activo",
  TOKEN_EXPIRADO: "Token expirado",
  ERROR: "Error",
  INACTIVO: "Inactivo",
};

/** Derivado de `ESTADO_BRIDGE_ETIQUETAS` para no duplicar el enum -- filtro de estado de `BridgesFiltros.tsx` (F8). */
export const ESTADOS_BRIDGE = Object.keys(ESTADO_BRIDGE_ETIQUETAS) as EstadoBridge[];

export const NIVEL_LOG_ETIQUETAS: Record<NivelBridgeLog, string> = {
  INFO: "Información",
  ADVERTENCIA: "Advertencia",
  ERROR: "Error",
};
