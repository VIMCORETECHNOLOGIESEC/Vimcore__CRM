import { ApiError } from "@/api/httpClient";
import type { RedSocial } from "@/tipos/lead";
import type {
  Bridge,
  BridgeLog,
  CrearBridgeInput,
  NivelBridgeLog,
  ResultadoBajaBridge,
  RespuestaClaveBridge,
} from "@/tipos/bridge";

/**
 * Capa de datos de administración de bridges (F8, docs/07) -- **mock en
 * memoria**, mismo criterio ya autorizado para F3-F6: no existe ningún
 * backend real de bridges. Se verificó explícitamente antes de escribir este
 * archivo -- `backend/src/routes/` solo tiene `auth.routes.ts`,
 * `salud.routes.ts` y `usuarios.routes.ts`; M8 (`docs/06-modulos-backend.md`)
 * no está implementado ni siquiera como esqueleto, y `docs/03-modelo-datos.md`
 * tampoco tiene modelos Prisma de `bridges`/`cuentas_publicitarias`/
 * `bridge_logs`. Todo punto de integración pendiente está marcado con el
 * token `INTEGRACION-BACKEND` (grepeable en todo el repo).
 *
 * Los nombres de columnas y el catálogo de estados/niveles sí están fijados
 * por `docs/03-modelo-datos.md` §`bridges`/`cuentas_publicitarias`/
 * `bridge_logs` y por `docs/05-bridges.md` -- no son una suposición del
 * frontend, a diferencia de F3-F6 donde el modelo de datos tampoco existía
 * todavía. Lo que sí es una decisión propia de este mock es el
 * comportamiento simulado de "verificación inmediata" y "prueba de
 * conexión" -- documentado en cada función.
 */

function delay(ms = 150): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hoursAgo(horas: number): string {
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
}

function daysFromNow(dias: number): string {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Fixture en memoria. Cubre los 4 estados de `bridges.estado`, las 5 redes
// sociales documentadas (docs/05), y las combinaciones de "aviso destacado"
// (token expirado / sin actividad / ninguno / ambos) que exige el checklist
// de F8 -- ver `bridges.utils.ts::evaluarAvisoBridge` para la regla exacta.
// ---------------------------------------------------------------------------

export const BRIDGES_MOCK: Bridge[] = [
  {
    id: "bridge-facebook",
    redSocial: "FACEBOOK",
    nombre: "Meta Ads — Facebook",
    estado: "ACTIVO",
    tokenExpiraEn: daysFromNow(45),
    ultimoLeadEn: hoursAgo(2),
    cuentasPublicitarias: [
      { id: "cuenta-fb-1", idExterno: "act_10029384756", nombre: "Cuenta Ads Principal", activa: true },
      { id: "cuenta-fb-2", idExterno: "act_10029384757", nombre: "Cuenta Ads Créditos", activa: false },
    ],
  },
  {
    id: "bridge-instagram",
    redSocial: "INSTAGRAM",
    nombre: "Meta Ads — Instagram",
    estado: "ACTIVO",
    tokenExpiraEn: daysFromNow(45),
    // Sin leads en más de 72 h con una cuenta activa: dispara el aviso de
    // "sin actividad" (docs/05 §8) sin que el token esté vencido.
    ultimoLeadEn: hoursAgo(100),
    cuentasPublicitarias: [
      { id: "cuenta-ig-1", idExterno: "act_20029384756", nombre: "Cuenta Ads Instagram", activa: true },
    ],
  },
  {
    id: "bridge-linkedin",
    redSocial: "LINKEDIN",
    nombre: "LinkedIn Lead Sync",
    estado: "TOKEN_EXPIRADO",
    // En el pasado: dispara el aviso de "token expirado". También lleva más
    // de 72 h sin leads, así que este bridge dispara los dos avisos a la vez
    // -- caso de prueba deliberado.
    tokenExpiraEn: daysFromNow(-3),
    ultimoLeadEn: hoursAgo(120),
    cuentasPublicitarias: [
      { id: "cuenta-li-1", idExterno: "li-org-4455", nombre: "LinkedIn Ads Empresa", activa: true },
    ],
  },
  {
    id: "bridge-x",
    redSocial: "X",
    nombre: "X — Formulario propio",
    estado: "ERROR",
    // X se autentica con clave de API por bridge, no con un token OAuth que
    // expira (docs/05 §5) -- por eso `tokenExpiraEn` es nulo incluso en
    // error: el estado ERROR describe otra causa (ver bitácora), no una
    // expiración.
    tokenExpiraEn: null,
    ultimoLeadEn: null,
    cuentasPublicitarias: [
      { id: "cuenta-x-1", idExterno: "utm-campana-x-01", nombre: "Campaña X Genérica", activa: true },
    ],
  },
  {
    id: "bridge-google-forms",
    redSocial: "GOOGLE_FORMS",
    nombre: "Google Forms — Pruebas",
    // Desactivado por defecto en producción (docs/05 §6) -- por diseño no
    // dispara "sin actividad" aunque nunca haya recibido un lead: un bridge
    // inactivo a propósito no es un problema de configuración a avisar.
    estado: "INACTIVO",
    tokenExpiraEn: null,
    ultimoLeadEn: null,
    cuentasPublicitarias: [],
  },
];

export const BRIDGE_LOGS_MOCK: BridgeLog[] = [
  {
    id: "log-01",
    bridgeId: "bridge-linkedin",
    nivel: "ERROR",
    mensaje: "El token de acceso expiró. Se dejaron de aceptar consultas programadas.",
    ocurridoEn: hoursAgo(120),
  },
  {
    id: "log-02",
    bridgeId: "bridge-linkedin",
    nivel: "ADVERTENCIA",
    mensaje: "Sin leads recibidos en las últimas 72 horas con campañas activas.",
    ocurridoEn: hoursAgo(72),
  },
  {
    id: "log-03",
    bridgeId: "bridge-linkedin",
    nivel: "INFO",
    mensaje: "Consulta programada ejecutada correctamente (0 leads nuevos).",
    ocurridoEn: hoursAgo(200),
  },
  {
    id: "log-04",
    bridgeId: "bridge-x",
    nivel: "ERROR",
    mensaje: "Firma inválida en la solicitud entrante. Se descartó el payload (401).",
    ocurridoEn: hoursAgo(10),
  },
  {
    id: "log-05",
    bridgeId: "bridge-x",
    nivel: "ERROR",
    mensaje: "Firma inválida en la solicitud entrante. Se descartó el payload (401).",
    ocurridoEn: hoursAgo(30),
  },
  {
    id: "log-06",
    bridgeId: "bridge-facebook",
    nivel: "INFO",
    mensaje: "Webhook recibido y procesado correctamente.",
    ocurridoEn: hoursAgo(2),
  },
  {
    id: "log-07",
    bridgeId: "bridge-facebook",
    nivel: "ADVERTENCIA",
    mensaje: "Teléfono del lead no pudo normalizarse a E.164. Persistido con marca de dato inválido.",
    ocurridoEn: hoursAgo(50),
  },
];

function findBridgeOrThrow(bridgeId: string): Bridge {
  const bridge = BRIDGES_MOCK.find((b) => b.id === bridgeId);
  if (!bridge) throw new Error(`No se encontró el bridge ${bridgeId}`);
  return bridge;
}

function cloneBridge(bridge: Bridge): Bridge {
  return { ...bridge, cuentasPublicitarias: bridge.cuentasPublicitarias.map((c) => ({ ...c })) };
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.get<{ bridges: Bridge[] }>("/bridges")` cuando exista un
 * backend real de bridges (M8). Listado con estado, último lead recibido y
 * expiración de token (docs/07 F8).
 */
export async function fetchBridgesApi(): Promise<Bridge[]> {
  await delay();
  return BRIDGES_MOCK.map(cloneBridge);
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.get<{ bridge: Bridge }>("/bridges/:id")`. Incluye las cuentas
 * publicitarias asociadas (docs/07 F8, "Detalle con cuentas publicitarias
 * asociadas").
 */
export async function fetchBridgeDetalleApi(bridgeId: string): Promise<Bridge> {
  await delay();
  return cloneBridge(findBridgeOrThrow(bridgeId));
}

/**
 * Vigencia simulada del token nuevo por red social, una vez "verificado".
 * Meta ~60 días (docs/05 §3, "Page Access Token de larga duración"),
 * LinkedIn más corto que Meta (docs/05 §4, "caducidad más corta que la de
 * Meta" -- sin cifra exacta documentada, se usa 30 días como valor
 * razonable). X y Google Forms se autentican con clave de API, sin
 * expiración (docs/05 §5/§6) -- `null` en vez de una fecha.
 */
const DIAS_VIGENCIA_TOKEN: Record<Bridge["redSocial"], number | null> = {
  FACEBOOK: 60,
  INSTAGRAM: 60,
  LINKEDIN: 30,
  X: null,
  GOOGLE_FORMS: null,
};

/** Umbral mínimo de caracteres para simular la "verificación inmediata" del token -- ver `saveTokenApi`. */
const LARGO_MINIMO_TOKEN_SIMULADO = 20;

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.post<{ bridge: Bridge }>("/bridges/:id/token", { token })`.
 * El backend real verificaría el token contra la plataforma
 * (Meta/LinkedIn/X) antes de guardarlo cifrado (docs/03 §`bridges.token_cifrado`,
 * "AES-256-GCM. Nunca sale por la API") y respondería con un error
 * accionable si la plataforma lo rechaza.
 *
 * DECISIÓN DE MOCK (no es un contrato real de ningún proveedor): sin ese
 * backend, este mock simula la "verificación inmediata" (docs/07 F8,
 * "Formulario de carga y renovación de token con verificación inmediata")
 * rechazando cualquier token de menos de
 * `LARGO_MINIMO_TOKEN_SIMULADO` caracteres una vez recortado espacios, para
 * poder ejercitar el flujo de error. El umbral es arbitrario -- la
 * verificación real la hace el proveedor, no una regla de longitud.
 *
 * Se usa `ApiError` (no un `Error` genérico, a diferencia de
 * `leadDetalle.api.ts`) para que el mensaje llegue accionable al usuario a
 * través del manejo global de errores de mutaciones (`api/queryClient.ts`,
 * `getErrorMessage`): un `Error` simple ahí se reemplaza por el mensaje
 * genérico, porque `getErrorMessage` solo reexpone el mensaje de instancias
 * de `ApiError`.
 */
export async function saveTokenApi(bridgeId: string, token: string): Promise<Bridge> {
  await delay();
  const bridge = findBridgeOrThrow(bridgeId);
  const tokenNormalizado = token.trim();

  if (tokenNormalizado.length < LARGO_MINIMO_TOKEN_SIMULADO) {
    throw new ApiError(
      "token_invalido",
      422,
      "El token no es válido. Verificá que lo copiaste completo desde la plataforma e intentá nuevamente.",
    );
  }

  const diasVigencia = DIAS_VIGENCIA_TOKEN[bridge.redSocial];
  bridge.estado = "ACTIVO";
  bridge.tokenExpiraEn = diasVigencia === null ? null : daysFromNow(diasVigencia);

  return cloneBridge(bridge);
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.post<{ ok: boolean; mensaje: string }>("/bridges/:id/probar-conexion")`.
 * Prueba de conexión bajo demanda (docs/07 F8, "Botón de prueba de
 * conexión") -- a diferencia de `saveTokenApi`, es puramente diagnóstica:
 * no cambia el estado guardado del bridge, solo informa si la conexión
 * funcionaría ahora mismo.
 *
 * DECISIÓN DE MOCK: el resultado se deriva del `estado` actual del bridge
 * (determinístico, no aleatorio, para que sea testeable) -- un backend real
 * haría una llamada de verificación real a la plataforma.
 */
export async function testConnectionApi(
  bridgeId: string,
): Promise<{ ok: boolean; mensaje: string }> {
  await delay();
  const bridge = findBridgeOrThrow(bridgeId);

  if (bridge.estado === "TOKEN_EXPIRADO") {
    return {
      ok: false,
      mensaje: "El token expiró. Cargá uno nuevo antes de volver a probar la conexión.",
    };
  }
  if (bridge.estado === "INACTIVO") {
    return { ok: false, mensaje: "Este bridge está inactivo. Activalo antes de probar la conexión." };
  }
  if (bridge.estado === "ERROR") {
    return {
      ok: false,
      mensaje: "La plataforma rechazó la última solicitud. Revisá la bitácora de errores para más detalle.",
    };
  }
  return { ok: true, mensaje: "Conexión verificada correctamente." };
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.patch<{ bridge: Bridge }>("/bridges/:id/cuentas/:cuentaId", { activa })`.
 * Alta/baja de cuentas publicitarias (docs/05 §7) -- el checklist de F8
 * (docs/07) solo pide mostrarlas asociadas al detalle; activar/desactivar se
 * agrega porque `docs/05-bridges.md` §7 sí lo documenta explícitamente como
 * parte del panel de administración.
 */
export async function toggleCuentaActivaApi(
  bridgeId: string,
  cuentaId: string,
  activa: boolean,
): Promise<Bridge> {
  await delay();
  const bridge = findBridgeOrThrow(bridgeId);
  const cuenta = bridge.cuentasPublicitarias.find((c) => c.id === cuentaId);
  if (!cuenta) throw new Error(`No se encontró la cuenta publicitaria ${cuentaId}`);
  cuenta.activa = activa;
  return cloneBridge(bridge);
}

export interface BridgeLogsFiltros {
  nivel?: NivelBridgeLog;
  /** ISO `YYYY-MM-DD`, inclusive. */
  fechaDesde?: string;
  /** ISO `YYYY-MM-DD`, inclusive. */
  fechaHasta?: string;
}

function matchesRangoFechas(ocurridoEn: string, fechaDesde?: string, fechaHasta?: string): boolean {
  const fecha = ocurridoEn.slice(0, 10);
  if (fechaDesde && fecha < fechaDesde) return false;
  if (fechaHasta && fecha > fechaHasta) return false;
  return true;
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.get<{ logs: BridgeLog[] }>("/bridges/:id/logs", { params: filtros })`.
 * Bitácora de errores con filtro por nivel y rango de fechas (docs/07 F8),
 * misma forma de filtros combinables que `fetchLeadsApi` (F3). Política de
 * retención de 90 días (docs/03) es responsabilidad del backend, no del
 * frontend.
 */
export async function fetchBridgeLogsApi(
  bridgeId: string,
  filtros: BridgeLogsFiltros = {},
): Promise<BridgeLog[]> {
  await delay();
  return BRIDGE_LOGS_MOCK.filter((log) => log.bridgeId === bridgeId)
    .filter((log) => !filtros.nivel || log.nivel === filtros.nivel)
    .filter((log) => matchesRangoFechas(log.ocurridoEn, filtros.fechaDesde, filtros.fechaHasta))
    .sort((a, b) => new Date(b.ocurridoEn).getTime() - new Date(a.ocurridoEn).getTime());
}

// ---------------------------------------------------------------------------
// bridge-lifecycle-management (Fase 1) -- alta/baja/reactivación/clave y
// catálogos de red social. `BRIDGES_MOCK` deja de ser solo mutable en sus
// campos: a partir de acá también cambia de TAMAÑO (push en alta, splice en
// baja física), mismo criterio ya usado para el resto del archivo.
// ---------------------------------------------------------------------------

/**
 * Genera un identificador de bridge nuevo. `crypto.randomUUID()` está
 * disponible tanto en navegadores modernos como en jsdom (entorno de test) --
 * no requiere ningún polyfill adicional.
 */
function generateIdBridge(): string {
  return `bridge-${crypto.randomUUID()}`;
}

/**
 * INTEGRACION-BACKEND: el backend real genera la clave con
 * `generarClaveBridge()` (`backend/src/lib/clave-bridge.ts`,
 * `brg_${randomBytes(32).toString("base64url")}`) y solo persiste su hash.
 * Este mock reproduce la MISMA FORMA (`brg_` + string aleatorio) para que
 * `ClaveBridgeModal` se ejercite con datos honestos, sin depender de ningún
 * backend -- el valor en sí no es criptográficamente equivalente.
 */
function generateClaveBridgeMock(): string {
  return `brg_${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Catálogo de creación (Requirement: Backend-Driven Creation Catalog). El
 * backend real lo deriva de `Object.values(RedSocial)` sobre el enum nativo
 * de Prisma -- el frontend no comparte ese cliente (misma decisión que el
 * resto de `tipos/*.ts`), así que este mock declara la misma lista de forma
 * explícita. Es la ÚNICA lista estática de redes sociales que debe quedar en
 * el frontend: `LeadsFiltros.tsx` (F3) y `NuevoBridgeDialog.tsx` (F8) NUNCA
 * declaran su propio arreglo -- consumen este catálogo o el de activas vía
 * los hooks de `useBridges.ts`.
 */
const TODAS_LAS_REDES_SOCIALES: RedSocial[] = ["FACEBOOK", "INSTAGRAM", "X", "LINKEDIN", "GOOGLE_FORMS"];

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.post<{ bridge: Bridge; claveApi: string }>("/bridges", input)`.
 * Alta de bridge (Requirement: Create Bridge) -- crea con `estado: "INACTIVO"`
 * (el admin lo activa explícitamente después) y devuelve la clave en texto
 * plano UNA SOLA VEZ, igual que `regenerateClaveApi`.
 */
export async function createBridgeApi(input: CrearBridgeInput): Promise<RespuestaClaveBridge> {
  await delay();
  const nuevoBridge: Bridge = {
    id: generateIdBridge(),
    redSocial: input.redSocial,
    nombre: input.nombre,
    estado: "INACTIVO",
    tokenExpiraEn: null,
    ultimoLeadEn: null,
    cuentasPublicitarias: [],
  };
  BRIDGES_MOCK.push(nuevoBridge);
  return { bridge: cloneBridge(nuevoBridge), claveApi: generateClaveBridgeMock() };
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.delete<{ resultado: "BAJA_FISICA" | "BAJA_LOGICA"; bridge: Bridge }>("/bridges/:id")`.
 * Baja física u lógica según haya recibido leads (Requirement: Hard Delete
 * Only Without Leads) -- el backend real decide con
 * `leadsRecibidos.count === 0`; el frontend no tiene ese conteo en
 * `tipos/bridge.ts`, así que este mock usa `ultimoLeadEn === null` como
 * señal equivalente ("nunca recibió un lead" implica cero leads
 * recibidos). DECISIÓN DE MOCK, a confirmar contra el backend real (M8) si
 * existiera algún caso donde `ultimoLeadEn` se limpie sin que el conteo sea
 * cero.
 */
export async function deleteBridgeApi(bridgeId: string): Promise<ResultadoBajaBridge> {
  await delay();
  const bridge = findBridgeOrThrow(bridgeId);

  if (bridge.ultimoLeadEn === null) {
    const bridgeEliminado = cloneBridge(bridge);
    const indice = BRIDGES_MOCK.findIndex((b) => b.id === bridgeId);
    BRIDGES_MOCK.splice(indice, 1);
    return { resultado: "BAJA_FISICA", bridge: bridgeEliminado };
  }

  bridge.estado = "INACTIVO";
  return { resultado: "BAJA_LOGICA", bridge: cloneBridge(bridge) };
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.patch<{ bridge: Bridge }>("/bridges/:id", { estado: "ACTIVO" })`.
 * Reactivación (Requirement: Soft Deactivate and Reactivate) -- solo cambia
 * `estado`; la clave y el historial (`ultimoLeadEn`, `cuentasPublicitarias`)
 * quedan intactos porque viven en la misma fila.
 */
export async function reactivateBridgeApi(bridgeId: string): Promise<Bridge> {
  await delay();
  const bridge = findBridgeOrThrow(bridgeId);
  bridge.estado = "ACTIVO";
  return cloneBridge(bridge);
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.post<{ bridge: Bridge; claveApi: string }>("/bridges/:id/clave")`.
 * Regeneración de clave (Requirement: Regenerate Key) -- invalida la clave
 * anterior de inmediato (en el backend real, sobrescribiendo el hash
 * guardado) y devuelve la nueva en texto plano una única vez. No cambia
 * `estado`: regenerar la clave es independiente de activar/desactivar el
 * bridge.
 */
export async function regenerateClaveApi(bridgeId: string): Promise<RespuestaClaveBridge> {
  await delay();
  const bridge = findBridgeOrThrow(bridgeId);
  return { bridge: cloneBridge(bridge), claveApi: generateClaveBridgeMock() };
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.get<{ redesSociales: RedSocial[] }>("/bridges/catalogo/redes-soportadas")`.
 * Catálogo de creación (Requirement: Backend-Driven Creation Catalog) --
 * consumido por `NuevoBridgeDialog.tsx` para poblar el selector de red
 * social sin hardcodear un arreglo en el componente.
 */
export async function fetchRedesSocialesSoportadasApi(): Promise<RedSocial[]> {
  await delay();
  return [...TODAS_LAS_REDES_SOCIALES];
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.get<{ redesSociales: RedSocial[] }>("/bridges/redes-activas")`.
 * Catálogo de redes activas (Requirement: Active Red-Social Catalog
 * Endpoint) -- fuente del filtro de red social de F3
 * (`leads/LeadsFiltros.tsx`). Solo valores DISTINTOS de bridges con
 * `estado === "ACTIVO"`; nunca expone id/nombre/estado por fila, igual que
 * el endpoint real (contención documentada en el diseño).
 */
export async function fetchRedesSocialesActivasApi(): Promise<RedSocial[]> {
  await delay();
  const activas = new Set(
    BRIDGES_MOCK.filter((bridge) => bridge.estado === "ACTIVO").map((bridge) => bridge.redSocial),
  );
  return [...activas];
}
