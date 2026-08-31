/**
 * Tipos compartidos con el backend real de bridges (integración M4,
 * `backend/src/services/bridge.service.ts` +
 * `backend/src/services/cuenta-publicitaria.service.ts`). Mantenerlos
 * sincronizados manualmente: el frontend no comparte el cliente de Prisma
 * generado (mismo criterio que `tipos/usuario.ts`/`tipos/lead.ts`).
 *
 * IMPORTANTE (docs/05 §7): "El token nunca se devuelve por la API, ni
 * siquiera enmascarado" -- por eso ni `Bridge` ni `CuentaPublicitariaBridge`
 * exponen el valor del token, solo su ESTADO de verificación y su fecha de
 * expiración (nunca el token en sí).
 *
 * GAP DE CONTRATO RESUELTO (worktree dev-back, 2026-08-19, posterior al gap
 * documentado originalmente en esta integración): `CuentaPublicitariaDto`
 * ahora expone `estadoToken`/`tokenExpiraEn` en TODAS las respuestas que
 * incluyen `cuenta`/`cuentas` (`GET /bridges/:id`, `GET /bridges/:id/cuentas`,
 * alta/edición de cuenta, carga de token). Esa es la única fuente real de
 * expiración de token -- `Bridge.tokenExpiraEn` (más abajo) sigue siendo una
 * constante muerta a nivel bridge y NO debe leerse para esto; ver
 * `bridges.utils.ts::evaluateAvisoBridge`/`evaluateEstadoTokenCuenta`.
 */
import type { RedSocial } from "./lead";

/**
 * Estado de verificación del token de una cuenta publicitaria puntual
 * (`cuenta-publicitaria.service.ts`/`verificacion-token.service.ts`,
 * backend real). Siempre presente en `CuentaPublicitariaDto`.
 */
export type EstadoTokenCuenta = "VALIDO" | "TOKEN_EXPIRADO" | "ERROR";

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

/**
 * Forma de una fila de `cuentas_publicitarias` tal como la expone
 * `CuentaPublicitariaDto` (backend real,
 * `cuenta-publicitaria.service.ts::toCuentaPublicitariaDto`) -- boundary
 * explícito de nombres: el backend traduce `idExternoVinculado` (Prisma) a
 * `instagramAccountId` (wire), nunca al revés.
 */
export interface CuentaPublicitariaBridge {
  id: string;
  bridgeId: string;
  /** ID de la cuenta en la plataforma -- para Meta, el ID de la Página (docs/05 §3). */
  idExterno: string;
  nombre: string;
  /** Cuenta de Instagram vinculada a la misma Página, si la hay (docs/05 §3). `null` en el resto de las redes. */
  instagramAccountId: string | null;
  activa: boolean;
  /** Siempre presente (backend real, 2026-08-19) -- ver nota de archivo. */
  estadoToken: EstadoTokenCuenta;
  /**
   * ISO 8601, o `null` si no hay token cargado todavía, o si el token no
   * expira (Page Access Token de larga duración de Meta). Fuente real de
   * expiración -- no confundir con `Bridge.tokenExpiraEn`, que es una
   * constante muerta a nivel bridge (ver más abajo).
   */
  tokenExpiraEn: string | null;
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
  /**
   * CAMPO MUERTO A NIVEL BRIDGE: el backend lo manda siempre como
   * `null` -- es una CONSTANTE hardcodeada del lado del servidor
   * (`bridge.service.ts::BridgeDto`, decisión de diseño "no hay columnas de
   * token a nivel bridge"; nunca va a traer datos reales). La expiración
   * real vive por CUENTA PUBLICITARIA (`CuentaPublicitariaBridge.tokenExpiraEn`
   * más arriba) -- usar esa, nunca esta, para cualquier lógica de aviso o
   * visualización de expiración.
   */
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
  /**
   * Empresa destino cuando el alta se dispara desde una "vista de empresa"
   * de un holding-wide (`BridgesPage.tsx` -> `useVistaEmpresa().empresaVistaId`,
   * mismo criterio que `usuarios.api.ts::CreateUsuarioInput.empresaId`).
   * `createBridgeBodySchema` (`backend/src/schemas/bridges.schema.ts`) YA
   * acepta este campo en `POST /bridges` -- una sesión holding-wide sin él
   * recibe 400 `empresa_requerida`. Sin empresa en vista, no se manda: el
   * backend resuelve la empresa solo a partir de la sesión.
   */
  empresaId?: string;
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

/**
 * Bridge genérico tipo *pull* (`docs/contrato-frontend-bridge-api_mat_01.md`,
 * material de prueba fuera de la secuencia numerada de `docs/`): en vez de un
 * adaptador de código por proveedor, el admin carga la URL, la API key y un
 * mapeo de campos de cualquier API propia del cliente que devuelva un array
 * JSON de leads. Creado con el mismo `POST /bridges` genérico
 * (`redSocial: "API_EXTERNA"`) -- estos tipos cubren los 3 endpoints
 * siguientes que cargan/prueban su configuración
 * (`bridge-api-externa.api.ts`). El job de backend que efectivamente hace el
 * polling de leads todavía NO EXISTE (gap de backend documentado
 * explícitamente en el contrato) -- estos endpoints solo configuran y
 * prueban, nunca sincronizan leads reales todavía.
 */

/**
 * Campo interno válido como valor de `mapeoCampos` -- cualquier otro valor es
 * rechazado por Zod en el backend (`bridges.schema.ts::CAMPOS_LEAD_MAPEABLES`).
 * `idExternoLead` es OBLIGATORIO: al menos una clave del mapeo debe apuntar
 * acá, es la clave de idempotencia contra `LeadRecibido`.
 */
export type CampoInternoApiExterna =
  | "idExternoLead"
  | "nombre"
  | "telefono"
  | "correo"
  | "idExternoCampania"
  | "nombreCampania"
  | "idExternoCuenta";

/** Forma de `configuracionJson` dentro de `BridgeApiExternaConfig` (ver más abajo). */
export interface ConfiguracionApiExterna {
  url: string;
  nombreHeaderApiKey: string;
  mapeoCampos: Record<string, CampoInternoApiExterna>;
  /** Nombre del query param de fecha (ISO 8601 UTC) que soporta el GET del cliente, si lo hay. */
  parametroFecha?: string;
}

/**
 * Respuesta compartida por `PATCH /bridges/:id/api-externa/conexion` y
 * `PATCH /bridges/:id/api-externa/mapeo` -- ninguna de las dos devuelve
 * `credencialExterna`, ni cifrada ni en claro (nunca sale por la API).
 */
export interface BridgeApiExternaConfig {
  id: string;
  redSocial: "API_EXTERNA";
  configuracionJson: ConfiguracionApiExterna;
}

/** Body de `PATCH /bridges/:id/api-externa/conexion` -- idempotente, no toca el mapeo si ya estaba cargado. */
export interface SaveConexionApiExternaInput {
  url: string;
  /** API key en texto plano del sistema externo; se cifra en el server, nunca se devuelve. */
  credencialExterna: string;
  /** Opcional, default `"X-Api-Key"` en el backend si se omite. */
  nombreHeaderApiKey?: string;
}

/** Body de `PATCH /bridges/:id/api-externa/mapeo` -- idempotente, no toca `url`/credencial ya cargados. */
export interface SaveMapeoApiExternaInput {
  mapeoCampos: Record<string, CampoInternoApiExterna>;
  parametroFecha?: string;
}

/**
 * Respuesta de `POST /bridges/:id/api-externa/probar-conexion` -- puramente
 * diagnóstica, SIEMPRE 200 (nunca falla con un error HTTP por un problema de
 * la API externa: red, HTTP no-2xx, forma inesperada, credencial no cargada,
 * etc. viajan todos como `ok: false` + `mensaje`).
 */
export interface ResultadoPruebaConexionApiExterna {
  ok: boolean;
  mensaje: string;
  /** Solo presente cuando `ok: true`. */
  cantidadLeads?: number;
}
