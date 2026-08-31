import type { EtapaLead, FormaPago } from "@/tipos/lead";
import type { TipoEventoOportunidad } from "@/tipos/oportunidad";

/**
 * Etiquetas en español del dominio de Oportunidad (Bloque D). Mapas propios
 * -- no se importan de `funcionalidades/leads/catalogos.ts` aunque compartan
 * el enum `EtapaLead`: cada módulo posee su propio texto de UI y puede
 * divergir sin arrastrar al otro.
 */

/** Etiqueta de cada etapa del embudo de la oportunidad. */
export const ETAPA_OPORTUNIDAD_ETIQUETAS: Record<EtapaLead, string> = {
  NUEVO: "Nuevo",
  CONTACTADO: "Contactado",
  CITA: "Cita",
  VENTA: "Venta",
  NO_VENTA: "No Venta",
};

/** Etiqueta de la forma de pago registrada al cerrar en Venta (D7). */
export const FORMA_PAGO_ETIQUETAS: Record<FormaPago, string> = {
  CONTADO: "Contado",
  CREDITO: "Crédito",
  FINANCIAMIENTO: "Financiamiento",
};

/**
 * Etiqueta de cada tipo de evento del log de la oportunidad. Forward-compat
 * only: todavía no hay endpoint de eventos, pero el mapa se define ahora para
 * que la línea de tiempo del detalle no tenga que inventarlo después.
 */
export const TIPO_EVENTO_OPORTUNIDAD_ETIQUETAS: Record<TipoEventoOportunidad, string> = {
  ASIGNADA_POOL: "Asignada por el pool",
  ASIGNADA_EXCEPCION_ADMINISTRATIVA: "Asignada por excepción administrativa",
  SIN_ASIGNAR: "Sin asignar",
  REASIGNADA_TRASPASO: "Reasignada por traspaso",
  ETAPA_CAMBIADA: "Cambio de etapa",
  CERRADA: "Cerrada",
};
