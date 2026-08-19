import type { Bridge, CuentaPublicitariaBridge } from "@/tipos/bridge";

/**
 * Lógica pura de bridges (F8, docs/07), separada de la capa mock
 * (`bridges.api.ts`) siguiendo el mismo criterio que `leads.utils.ts`/
 * `leads.api.ts` y `metricas.utils.ts`/`metricas.api.ts`: es la parte con
 * lógica real que exige test unitario per AGENTS.md §5.
 */

const HORAS_SIN_ACTIVIDAD = 72;

/**
 * DECISIÓN DE DISEÑO (2026-08-19, no hay un plazo fijado en docs/03/docs/05
 * para "próximo a vencer"): 7 días. La única pista concreta en el repo es la
 * notificación mock `TOKEN_POR_EXPIRAR` de `notificaciones/notificaciones.api.ts`
 * ("El token de la cuenta publicitaria de Instagram expira en 7 días."), que
 * usa ese mismo plazo -- se adopta acá por consistencia, no por ser un valor
 * documentado formalmente. A revisar si el backend llega a exponer un umbral
 * configurable.
 */
const UMBRAL_TOKEN_PROXIMO_A_VENCER_DIAS = 7;

export interface AvisoBridge {
  /**
   * Alguna cuenta publicitaria del bridge tiene `estadoToken === "TOKEN_EXPIRADO"`
   * (peor caso entre `bridge.cuentasPublicitarias` -- ver `evaluateAvisoBridge`).
   * Fuente real: `CuentaPublicitariaBridge.estadoToken`, NUNCA
   * `Bridge.estado`/`Bridge.tokenExpiraEn`, que son datos muertos a nivel
   * bridge (ver `tipos/bridge.ts`).
   */
  tokenExpirado: boolean;
  /**
   * Ninguna cuenta tiene el token ya expirado, pero al menos una expira
   * dentro de `UMBRAL_TOKEN_PROXIMO_A_VENCER_DIAS` días (peor caso entre
   * cuentas). Mutuamente excluyente con `tokenExpirado` a propósito: un
   * bridge con una cuenta ya expirada no necesita además el aviso de
   * "próximo a vencer", que sería redundante y menos urgente.
   */
  tokenProximoAVencer: boolean;
  /**
   * Sin leads en más de `HORAS_SIN_ACTIVIDAD` horas, con al menos una cuenta
   * publicitaria activa (docs/05 §8: "Bridge sin leads durante 72 h con
   * campañas activas: advertencia").
   *
   * DECISIÓN DE DISEÑO (docs/03 no modela "campaña" como entidad del bridge,
   * solo `cuentas_publicitarias`): se interpreta "campañas activas" como "al
   * menos una cuenta publicitaria activa" -- es la señal más cercana
   * disponible en el modelo de datos documentado, a confirmar contra el
   * backend real (M8) si existiera un concepto de campaña más granular.
   */
  sinActividad: boolean;
}

/** `true` si `cuenta` tiene un token válido que vence dentro del umbral (nunca para uno ya expirado -- esa es otra rama). */
function isProximoAVencer(cuenta: CuentaPublicitariaBridge, ahora: Date): boolean {
  if (cuenta.estadoToken !== "VALIDO" || cuenta.tokenExpiraEn === null) return false;
  const diasRestantes = (new Date(cuenta.tokenExpiraEn).getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000);
  return diasRestantes >= 0 && diasRestantes <= UMBRAL_TOKEN_PROXIMO_A_VENCER_DIAS;
}

/**
 * Un bridge `INACTIVO` está desactivado a propósito (ej. Google Forms fuera
 * de pruebas, docs/05 §6, "Debe quedar desactivado por defecto en el
 * despliegue de producción") -- nunca dispara "sin actividad": no recibir
 * leads es el comportamiento esperado, no un problema de configuración.
 */
export function evaluateAvisoBridge(bridge: Bridge, ahora: Date = new Date()): AvisoBridge {
  // GAP DE CONTRATO RESUELTO (worktree dev-back, 2026-08-19): `Bridge.estado`
  // nunca vale `"TOKEN_EXPIRADO"` para los bridges actuales -- esa
  // granularidad vive por CUENTA PUBLICITARIA (`CuentaPublicitaria.estadoToken`,
  // `verificacion-token.service.ts`), no en `Bridge.estado`
  // (`Bridge.estado.TOKEN_EXPIRADO` queda reservado, según el propio schema
  // de Prisma, "para un futuro bridge sin granularidad por cuenta"). Ahora que
  // `CuentaPublicitariaDto` expone `estadoToken`/`tokenExpiraEn`, se calcula
  // el PEOR CASO entre todas las cuentas del bridge en vez de leer
  // `bridge.estado`/`bridge.tokenExpiraEn` (dato muerto, ver `tipos/bridge.ts`).
  const tokenExpirado = bridge.cuentasPublicitarias.some(
    (cuenta) => cuenta.estadoToken === "TOKEN_EXPIRADO",
  );
  const tokenProximoAVencer =
    !tokenExpirado && bridge.cuentasPublicitarias.some((cuenta) => isProximoAVencer(cuenta, ahora));

  const tieneCuentaActiva = bridge.cuentasPublicitarias.some((cuenta) => cuenta.activa);
  const horasDesdeUltimoLead = bridge.ultimoLeadEn
    ? (ahora.getTime() - new Date(bridge.ultimoLeadEn).getTime()) / (60 * 60 * 1000)
    : null;
  const sinActividad =
    bridge.estado !== "INACTIVO" &&
    tieneCuentaActiva &&
    (horasDesdeUltimoLead === null || horasDesdeUltimoLead >= HORAS_SIN_ACTIVIDAD);

  return { tokenExpirado, tokenProximoAVencer, sinActividad };
}

/** `true` si corresponde mostrar el aviso destacado (docs/07 F8, "Aviso destacado ante token expirado o bridge sin actividad"). */
export function hasAvisoDestacado(aviso: AvisoBridge): boolean {
  return aviso.tokenExpirado || aviso.tokenProximoAVencer || aviso.sinActividad;
}

/**
 * Fecha de expiración de token más urgente entre las cuentas publicitarias
 * del bridge (la más próxima -- si alguna ya venció, esa fecha pasada gana
 * igual, porque es la más chica). Reemplaza la lectura de
 * `Bridge.tokenExpiraEn`, que es una constante muerta a nivel bridge (ver
 * `tipos/bridge.ts`). `null` si ninguna cuenta tiene una fecha de expiración
 * conocida (sin token cargado, o token de larga duración que no expira).
 */
export function proximaExpiracionTokenBridge(bridge: Bridge): string | null {
  const fechas = bridge.cuentasPublicitarias
    .map((cuenta) => cuenta.tokenExpiraEn)
    .filter((fecha): fecha is string => fecha !== null);
  if (fechas.length === 0) return null;
  return fechas.reduce((masProxima, actual) =>
    new Date(actual).getTime() < new Date(masProxima).getTime() ? actual : masProxima,
  );
}

export type EstadoTokenCuentaDisplay =
  | "TOKEN_EXPIRADO"
  | "TOKEN_PROXIMO_A_VENCER"
  | "TOKEN_VALIDO"
  | "ERROR_VERIFICACION";

/**
 * Estado de token de UNA cuenta puntual, sin agregación (a diferencia de
 * `evaluateAvisoBridge`, que calcula el peor caso entre todas las cuentas de
 * un bridge). Usado en `CuentasPublicitariasList` (F8, detalle por cuenta):
 * ahí ya se tiene el contexto de cada fila, así que mostrar el estado exacto
 * de esa cuenta es más preciso que repetir el agregado a nivel bridge.
 */
export function evaluateEstadoTokenCuenta(
  cuenta: CuentaPublicitariaBridge,
  ahora: Date = new Date(),
): EstadoTokenCuentaDisplay {
  if (cuenta.estadoToken === "TOKEN_EXPIRADO") return "TOKEN_EXPIRADO";
  if (cuenta.estadoToken === "ERROR") return "ERROR_VERIFICACION";
  if (isProximoAVencer(cuenta, ahora)) return "TOKEN_PROXIMO_A_VENCER";
  return "TOKEN_VALIDO";
}

/**
 * `true` si es ESPERABLE que el bridge se elimine físicamente en vez de
 * darse de baja lógicamente (bridge-lifecycle-management, Requirement: Hard
 * Delete Only Without Leads) -- usada SOLO para el texto del diálogo de
 * confirmación ANTES de llamar a `deleteBridgeApi`, nunca para decidir el
 * resultado real: el backend real decide con `leadsRecibidos.count === 0`
 * dentro de una transacción (`bridge.service.ts::deleteBridge`) y devuelve
 * `resultado` en la respuesta -- `useDeleteBridge`/`BridgesPage` consumen
 * ese campo tal cual, sin replicar la decisión acá. `tipos/bridge.ts` no
 * trae ese conteo al frontend, así que se usa `ultimoLeadEn === null`
 * ("nunca recibió un lead") como señal equivalente para el mensaje previo a
 * confirmar; puede divergir del resultado real en un caso de carrera (un
 * lead entra justo entre abrir el diálogo y confirmar), que el 200 real ya
 * resuelve correctamente porque nunca se basa en esta función.
 */
export function canEliminarseFisicamente(bridge: Bridge): boolean {
  return bridge.ultimoLeadEn === null;
}

/** `DD/MM/AAAA HH:mm` en hora local del navegador (docs/07, "Formato de fechas"). */
export function formatFecha(iso: string): string {
  const fecha = new Date(iso);
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const horas = String(fecha.getHours()).padStart(2, "0");
  const minutos = String(fecha.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${fecha.getFullYear()} ${horas}:${minutos}`;
}
