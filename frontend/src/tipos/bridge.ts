/**
 * Tipos compartidos con el backend para bridges de captación (F8, docs/07 +
 * docs/05-bridges.md + docs/03-modelo-datos.md §`bridges`/`cuentas_publicitarias`/
 * `bridge_logs`). Mantenerlos sincronizados manualmente: el frontend no
 * comparte el cliente de Prisma generado (mismo criterio que
 * `tipos/usuario.ts`/`tipos/lead.ts`).
 *
 * IMPORTANTE (docs/05 §7): "El token nunca se devuelve por la API, ni
 * siquiera enmascarado" -- por eso `Bridge` no tiene ningún campo de token.
 * La interfaz solo conoce `estado` y `tokenExpiraEn`.
 */
import type { RedSocial } from "./lead";

export type EstadoBridge = "ACTIVO" | "TOKEN_EXPIRADO" | "ERROR" | "INACTIVO";

export type NivelBridgeLog = "INFO" | "ADVERTENCIA" | "ERROR";

/**
 * Estilo de autenticación de un bridge (bridge-lifecycle-management,
 * Requirement: Credential Form Branches by Authentication Style). Determina
 * qué formulario de credenciales se muestra: `CLAVE_API` genera/regenera una
 * clave del lado del servidor (el admin nunca la escribe); `TOKEN_PROVEEDOR`
 * usa el flujo OAuth existente de `TokenForm.tsx` (Fase 2, ver
 * `catalogos.ts::ESTILO_AUTENTICACION_POR_RED`).
 */
export type EstiloAutenticacionBridge = "CLAVE_API" | "TOKEN_PROVEEDOR";

/** Forma de una fila de `cuentas_publicitarias` (docs/03). */
export interface CuentaPublicitariaBridge {
  id: string;
  /** ID de la cuenta en la plataforma (docs/03 §`cuentas_publicitarias.id_externo`). */
  idExterno: string;
  nombre: string;
  activa: boolean;
}

/**
 * Forma de una fila de `bridges` (docs/03) tal como la expondría el backend
 * -- sin `token_cifrado` ni `secreto_webhook`, que nunca salen por la API.
 * `cuentasPublicitarias` viene embebida para evitar una segunda consulta en
 * la pantalla de detalle (docs/07 F8, "Detalle con cuentas publicitarias
 * asociadas").
 */
export interface Bridge {
  id: string;
  redSocial: RedSocial;
  /** Etiqueta del administrador (docs/03 §`bridges.nombre`). */
  nombre: string;
  estado: EstadoBridge;
  /** ISO 8601 (UTC). Nulo para bridges de clave de API que no expiran (X, Google Forms). */
  tokenExpiraEn: string | null;
  /** ISO 8601 (UTC). Nulo si nunca recibió un lead -- detección de bridges mudos (docs/03). */
  ultimoLeadEn: string | null;
  cuentasPublicitarias: CuentaPublicitariaBridge[];
}

/** Forma de una fila de `bridge_logs` (docs/03) para la bitácora de errores del detalle. */
export interface BridgeLog {
  id: string;
  bridgeId: string;
  nivel: NivelBridgeLog;
  mensaje: string;
  ocurridoEn: string;
}

/** Payload de alta de un bridge (bridge-lifecycle-management, Requirement: Create Bridge). */
export interface CrearBridgeInput {
  redSocial: RedSocial;
  nombre: string;
}

/**
 * Respuesta de alta o regeneración de clave (Requirement: Create Bridge,
 * Regenerate Key). `claveApi` es la ÚNICA exposición en texto plano de la
 * clave -- el backend real solo almacena su hash irreversible, así que este
 * campo no vuelve a aparecer en ninguna otra respuesta.
 */
export interface RespuestaClaveBridge {
  bridge: Bridge;
  claveApi: string;
}

/** Resultado de dar de baja un bridge (Requirement: Hard Delete Only Without Leads). */
export interface ResultadoBajaBridge {
  resultado: "BAJA_FISICA" | "BAJA_LOGICA";
  bridge: Bridge;
}
