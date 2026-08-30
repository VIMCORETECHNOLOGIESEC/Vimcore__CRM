import type { EstadoSla, EtapaLead, RedSocial, SemaforoLead } from "@/tipos/lead";

/** Etiquetas en español de cada etapa (docs/02-reglas-negocio.md §6). */
export const ETAPA_ETIQUETAS: Record<EtapaLead, string> = {
  NUEVO: "Nuevo",
  CONTACTADO: "Contactado",
  CITA: "Cita",
  VENTA: "Venta",
  NO_VENTA: "No Venta",
};

export const RED_SOCIAL_ETIQUETAS: Record<RedSocial, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  X: "X",
  LINKEDIN: "LinkedIn",
  GOOGLE_FORMS: "Google Forms",
  API_EXTERNA: "API externa",
};

/**
 * Etiqueta de semáforo con su lectura comercial (docs/04-formularios-semaforo.md
 * §2, tabla textual): VERDE = lead caliente/prioridad, AMARILLO = lead
 * tibio, ROJO = lead frío/bajo esfuerzo. El color visual sigue siempre el
 * nombre literal del enum (verde=verde, ámbar=amarillo, rojo=rojo) -- ver el
 * comentario de `SemaforoBadge.tsx` sobre por qué **no** se reutilizan los
 * tokens `semaforo-frio/tibio/caliente` de `tailwind.config.js` para esto.
 */
export const SEMAFORO_ETIQUETAS: Record<SemaforoLead, string> = {
  VERDE: "Lead caliente",
  AMARILLO: "Lead tibio",
  ROJO: "Lead frío",
};

export const ESTADO_SLA_ETIQUETAS: Record<EstadoSla, string> = {
  A_TIEMPO: "A tiempo",
  EN_RIESGO: "En riesgo",
  ATRASADO: "Atrasado",
  CERRADO: "Cerrado",
};
