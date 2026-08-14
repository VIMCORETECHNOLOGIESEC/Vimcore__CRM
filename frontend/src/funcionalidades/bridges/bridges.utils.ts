import type { Bridge } from "@/tipos/bridge";

/**
 * Lógica pura de bridges (F8, docs/07), separada de la capa mock
 * (`bridges.api.ts`) siguiendo el mismo criterio que `leads.utils.ts`/
 * `leads.api.ts` y `metricas.utils.ts`/`metricas.api.ts`: es la parte con
 * lógica real que exige test unitario per AGENTS.md §5.
 */

const HORAS_SIN_ACTIVIDAD = 72;

export interface AvisoBridge {
  /** `estado === "TOKEN_EXPIRADO"` -- única fuente de verdad (docs/03 §`bridges.estado`, docs/05 §8). */
  tokenExpirado: boolean;
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

/**
 * Un bridge `INACTIVO` está desactivado a propósito (ej. Google Forms fuera
 * de pruebas, docs/05 §6, "Debe quedar desactivado por defecto en el
 * despliegue de producción") -- nunca dispara "sin actividad": no recibir
 * leads es el comportamiento esperado, no un problema de configuración.
 */
export function evaluarAvisoBridge(bridge: Bridge, ahora: Date = new Date()): AvisoBridge {
  const tokenExpirado = bridge.estado === "TOKEN_EXPIRADO";

  const tieneCuentaActiva = bridge.cuentasPublicitarias.some((cuenta) => cuenta.activa);
  const horasDesdeUltimoLead = bridge.ultimoLeadEn
    ? (ahora.getTime() - new Date(bridge.ultimoLeadEn).getTime()) / (60 * 60 * 1000)
    : null;
  const sinActividad =
    bridge.estado !== "INACTIVO" &&
    tieneCuentaActiva &&
    (horasDesdeUltimoLead === null || horasDesdeUltimoLead >= HORAS_SIN_ACTIVIDAD);

  return { tokenExpirado, sinActividad };
}

/** `true` si corresponde mostrar el aviso destacado (docs/07 F8, "Aviso destacado ante token expirado o bridge sin actividad"). */
export function tieneAvisoDestacado(aviso: AvisoBridge): boolean {
  return aviso.tokenExpirado || aviso.sinActividad;
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
