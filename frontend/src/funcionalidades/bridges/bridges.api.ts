import { httpClient } from "@/api/httpClient";
import type { RedSocial } from "@/tipos/lead";
import type {
  Bridge,
  BridgeLog,
  CrearBridgeInput,
  CuentaPublicitariaBridge,
  NivelBridgeLog,
  ResultadoBajaBridge,
  RespuestaClaveBridge,
} from "@/tipos/bridge";

/**
 * Capa de datos de administración de bridges (F8, docs/07) -- backend real
 * (integración M4, `backend/src/controllers/bridge.controller.ts` +
 * `backend/src/routes/bridges.routes.ts`). Reemplaza el mock en memoria que
 * usaba este archivo hasta esta integración (mismo criterio que
 * `leads/leads.api.ts`, F3/F4).
 *
 * GAP DE CONTRATO CONFIRMADO (ver `tipos/bridge.ts` para el detalle
 * completo): la administración de token/verificación de conexión es POR
 * `CuentaPublicitaria`, no por `Bridge` -- los endpoints reales
 * (`POST /bridges/:id/cuentas/:cuentaId/token`,
 * `POST /bridges/:id/cuentas/:cuentaId/probar-conexion`) exigen `cuentaId`
 * además de `bridgeId`. `saveTokenApi`/`testConnectionApi` reciben ambos
 * identificadores -- la UI se rediseñó para renderizar estos controles POR
 * CADA FILA de `CuentasPublicitariasList` en vez de una sola vez a nivel de
 * `BridgeDetallePage` (ver `detalle/CuentasPublicitariasList.tsx`).
 *
 * `httpClient` ya mapea errores del backend (`{ code, message }`) a
 * `ApiError` -- las excepciones se propagan tal cual, sin envolverlas de
 * nuevo (mismo patrón que `leads.api.ts`).
 */

// ---------------------------------------------------------------------------
// Formas exactas de las respuestas del backend real -- confirmadas contra
// `bridge.controller.ts`/`bridge.service.ts`/`cuenta-publicitaria.service.ts`
// (worktree dev-back).
// ---------------------------------------------------------------------------

interface BridgesListResponse {
  bridges: Bridge[];
}

interface BridgeDetalleResponse {
  bridge: Bridge;
}

interface CuentaPublicitariaResponse {
  cuenta: CuentaPublicitariaBridge;
}

interface BridgeLogsResponse {
  logs: BridgeLog[];
}

interface RedesSocialesResponse {
  redesSociales: RedSocial[];
}

export interface ResultadoPruebaConexion {
  ok: boolean;
  mensaje: string;
}

/** `GET /bridges`: listado con estado, último lead recibido y expiración de token (docs/07 F8). */
export async function fetchBridgesApi(): Promise<Bridge[]> {
  const { bridges } = await httpClient.get<BridgesListResponse>("/bridges");
  return bridges;
}

/** `GET /bridges/:id`: incluye las cuentas publicitarias asociadas (docs/07 F8, "Detalle con cuentas publicitarias asociadas"). */
export async function fetchBridgeDetalleApi(bridgeId: string): Promise<Bridge> {
  const { bridge } = await httpClient.get<BridgeDetalleResponse>(`/bridges/${bridgeId}`);
  return bridge;
}

/**
 * `POST /bridges/:id/cuentas/:cuentaId/token`: carga y renovación de token
 * con verificación inmediata contra Graph API `/debug_token`
 * (docs/05-bridges.md §7, `cuenta-publicitaria.service.ts::cargarToken`). Un
 * token que el proveedor rechaza responde 422 y nunca se persiste -- el
 * `ApiError` resultante ya trae un mensaje accionable en español (backend:
 * `meta_token_invalido`), sin necesidad de mapearlo acá.
 */
export async function saveTokenApi(
  bridgeId: string,
  cuentaId: string,
  token: string,
): Promise<CuentaPublicitariaBridge> {
  const { cuenta } = await httpClient.post<CuentaPublicitariaResponse>(
    `/bridges/${bridgeId}/cuentas/${cuentaId}/token`,
    { token },
  );
  return cuenta;
}

/**
 * `POST /bridges/:id/cuentas/:cuentaId/probar-conexion`: prueba de conexión
 * bajo demanda (docs/07 F8, "Botón de prueba de conexión") -- puramente
 * diagnóstica, nunca cambia el estado guardado de la cuenta
 * (`cuenta-publicitaria.service.ts::probarConexion`). Siempre responde
 * `{ ok, mensaje }` con 200, nunca un error HTTP.
 */
export async function testConnectionApi(
  bridgeId: string,
  cuentaId: string,
): Promise<ResultadoPruebaConexion> {
  return httpClient.post<ResultadoPruebaConexion>(
    `/bridges/${bridgeId}/cuentas/${cuentaId}/probar-conexion`,
  );
}

/**
 * `PATCH /bridges/:id/cuentas/:cuentaId`: alta/baja de cuentas publicitarias
 * (docs/05 §7) -- solo alterna `activa` (Requirement: PATCH toggles only
 * activation).
 */
export async function toggleCuentaActivaApi(
  bridgeId: string,
  cuentaId: string,
  activa: boolean,
): Promise<CuentaPublicitariaBridge> {
  const { cuenta } = await httpClient.patch<CuentaPublicitariaResponse>(
    `/bridges/${bridgeId}/cuentas/${cuentaId}`,
    { activa },
  );
  return cuenta;
}

export interface BridgeLogsFiltros {
  nivel?: NivelBridgeLog;
  /** ISO `YYYY-MM-DD`, inclusive -- el backend la coerciona con `z.coerce.date()`. */
  fechaDesde?: string;
  /** ISO `YYYY-MM-DD`, inclusive. */
  fechaHasta?: string;
}

/**
 * `GET /bridges/:id/logs`: bitácora de errores con filtro por nivel y rango
 * de fechas (docs/07 F8), misma forma de filtros combinables que
 * `fetchLeadsApi` (F3). El backend acota el resultado en el servidor (tope
 * 500, default 100, `bridge.service.ts::resolverLimiteLogs`) -- el frontend
 * no manda `limite` explícito, confía en el default.
 */
export async function fetchBridgeLogsApi(
  bridgeId: string,
  filtros: BridgeLogsFiltros = {},
): Promise<BridgeLog[]> {
  const { logs } = await httpClient.get<BridgeLogsResponse>(`/bridges/${bridgeId}/logs`, {
    params: {
      nivel: filtros.nivel,
      fechaDesde: filtros.fechaDesde,
      fechaHasta: filtros.fechaHasta,
    },
  });
  return logs;
}

/**
 * `POST /bridges`: alta de bridge (Requirement: Create Bridge) -- crea con
 * `estado: "INACTIVO"` (el admin lo activa explícitamente después) y
 * devuelve la clave en texto plano UNA SOLA VEZ, igual que
 * `regenerateClaveApi`.
 */
export async function createBridgeApi(input: CrearBridgeInput): Promise<RespuestaClaveBridge> {
  return httpClient.post<RespuestaClaveBridge>("/bridges", input);
}

/**
 * `DELETE /bridges/:id`: baja física o lógica según haya recibido leads
 * (Requirement: Hard Delete Only Without Leads). El backend real decide con
 * `leadsRecibidos.count === 0` dentro de una transacción
 * (`bridge.service.ts::deleteBridge`) -- el frontend solo consume
 * `resultado`, nunca replica esa decisión.
 */
export async function deleteBridgeApi(bridgeId: string): Promise<ResultadoBajaBridge> {
  return httpClient.delete<ResultadoBajaBridge>(`/bridges/${bridgeId}`);
}

/**
 * `PATCH /bridges/:id`: reactivación (Requirement: Soft Deactivate and
 * Reactivate) -- único endpoint admitido para cambiar `estado`, restringido
 * a `ACTIVO|INACTIVO` (`updateBridgeBodySchema`). Solo cambia `estado`; la
 * clave y el historial quedan intactos.
 */
export async function reactivateBridgeApi(bridgeId: string): Promise<Bridge> {
  const { bridge } = await httpClient.patch<BridgeDetalleResponse>(`/bridges/${bridgeId}`, {
    estado: "ACTIVO",
  });
  return bridge;
}

/**
 * `POST /bridges/:id/clave`: regeneración de clave (Requirement: Regenerate
 * Key) -- invalida la clave anterior de inmediato y devuelve la nueva en
 * texto plano una única vez. No cambia `estado`.
 */
export async function regenerateClaveApi(bridgeId: string): Promise<RespuestaClaveBridge> {
  return httpClient.post<RespuestaClaveBridge>(`/bridges/${bridgeId}/clave`);
}

/**
 * `GET /bridges/catalogo/redes-soportadas`: catálogo de creación
 * (Requirement: Backend-Driven Creation Catalog), derivado del enum nativo
 * de Prisma en el servidor (`bridge.service.ts::redesSoportadas`).
 */
export async function fetchRedesSocialesSoportadasApi(): Promise<RedSocial[]> {
  const { redesSociales } = await httpClient.get<RedesSocialesResponse>(
    "/bridges/catalogo/redes-soportadas",
  );
  return redesSociales;
}

/**
 * `GET /bridges/redes-activas`: catálogo de redes activas (Requirement:
 * Active Red-Social Catalog Endpoint) -- fuente del filtro de red social de
 * F3 (`leads/LeadsFiltros.tsx`).
 */
export async function fetchRedesSocialesActivasApi(): Promise<RedSocial[]> {
  const { redesSociales } = await httpClient.get<RedesSocialesResponse>("/bridges/redes-activas");
  return redesSociales;
}
