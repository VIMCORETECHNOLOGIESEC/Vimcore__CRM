import type { EtapaLead } from "@/tipos/lead";

/**
 * Máquina de etapas de una Oportunidad (Bloque D,
 * `docs/blocks/d-routing-oportunidad.md`). Reglas MÁS ESTRICTAS que las de
 * Lead (`funcionalidades/leads/etapas.ts`): la edición de etapa intermedia
 * solo permite el paso lineal siguiente (`NUEVO→CONTACTADO→CITA`); NUNCA
 * salta a VENTA/NO_VENTA -- el cierre tiene su propia autoridad (D7) y va por
 * `POST /oportunidades/:id/cerrar`, no por `PATCH .../etapa`.
 *
 * Espejo de `backend/src/services/negociacion/oportunidad.service.ts::TRANSICIONES_VALIDAS`
 * y `backend/src/schemas/negociacion/oportunidad.schema.ts::patchOportunidadEtapaBodySchema`.
 * El servidor es la fuente de verdad: ante un 409 (`transicion_invalida` /
 * `oportunidad_cerrada`) la UI refetchea y no aplica cambios optimistas.
 */

/** Etapas terminales de una oportunidad -- no se reabren. */
export const ETAPAS_TERMINALES: EtapaLead[] = ["VENTA", "NO_VENTA"];

/**
 * Transiciones intermedias válidas por etapa (las que expone
 * `PATCH /oportunidades/:id/etapa`). VENTA/NO_VENTA nunca aparecen como
 * destino acá -- se cierran por `POST /cerrar`.
 */
export const TRANSICIONES_INTERMEDIAS: Record<EtapaLead, EtapaLead[]> = {
  NUEVO: ["CONTACTADO"],
  CONTACTADO: ["CITA"],
  CITA: [],
  VENTA: [],
  NO_VENTA: [],
};

/** Etapas intermedias a las que se puede avanzar desde `etapa` (0 o 1 elemento). */
export function getTransicionesIntermediasValidas(etapa: EtapaLead): EtapaLead[] {
  return TRANSICIONES_INTERMEDIAS[etapa];
}

/** `true` si la oportunidad está en una etapa terminal (VENTA/NO_VENTA). */
export function esTerminal(etapa: EtapaLead): boolean {
  return ETAPAS_TERMINALES.includes(etapa);
}
