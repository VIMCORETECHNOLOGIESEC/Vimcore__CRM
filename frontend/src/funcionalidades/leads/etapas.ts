import type { EtapaLead } from "@/tipos/lead";

/**
 * Fuente única de verdad de las etapas del embudo y sus transiciones válidas
 * (docs/02-reglas-negocio.md §6). Antes `ETAPAS_TERMINALES` vivía duplicada
 * en `leads.api.ts` y `detalle/leadDetalle.guards.ts` -- unificada acá.
 *
 * Regla vigente (reemplaza a la anterior "el orden es sugerido, no
 * obligatorio"): progreso **lineal hacia adelante** entre las etapas no
 * terminales (nunca se retrocede de una etapa no terminal a otra anterior),
 * más salto directo a cierre (VENTA o NO_VENTA) desde cualquier etapa no
 * terminal. Una etapa terminal no se reabre (sin cambios, ya era así).
 */

/** Etapas en las que un lead ya no puede volver a moverse (docs/02 §6). */
export const ETAPAS_TERMINALES: EtapaLead[] = ["VENTA", "NO_VENTA"];

/** Etapas no terminales, en el orden lineal en que se atraviesan. */
export const ETAPAS_LINEALES: EtapaLead[] = ["NUEVO", "CONTACTADO", "CITA"];

const TRANSICIONES_VALIDAS: Record<EtapaLead, EtapaLead[]> = {
  NUEVO: ["CONTACTADO", "VENTA", "NO_VENTA"],
  CONTACTADO: ["CITA", "VENTA", "NO_VENTA"],
  CITA: ["VENTA", "NO_VENTA"],
  VENTA: [],
  NO_VENTA: [],
};

/**
 * Etapas a las que se puede transicionar válidamente desde `etapaActual`
 * (docs/02-reglas-negocio.md §6). Whitelist única consumida por la UI
 * (`detalle/LeadTimeline.tsx`, para construir el siguiente paso lineal) --
 * el backend real (M5) deberá validar contra la misma lista del lado del
 * servidor, sin confiar en que el cliente la respete (ver anotación en
 * `docs/06-modulos-backend.md`).
 */
export function getTransicionesValidas(etapaActual: EtapaLead): EtapaLead[] {
  return TRANSICIONES_VALIDAS[etapaActual];
}

/**
 * Etiquetas del timeline de F4 (`detalle/LeadTimeline.tsx`), distintas de
 * `catalogos.ts::ETAPA_ETIQUETAS` a propósito: ese catálogo lo consumen
 * filtros/tabla/dashboard y no debe tocarse por este cambio. Estas son solo
 * para los nodos de la línea de tiempo del detalle de lead.
 */
export const ETAPA_TIMELINE_ETIQUETAS: Record<EtapaLead, string> = {
  NUEVO: "Nuevo",
  CONTACTADO: "Contactado",
  CITA: "Cita agendada",
  VENTA: "Venta cerrada",
  NO_VENTA: "No venta",
};
