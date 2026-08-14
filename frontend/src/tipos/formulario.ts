/**
 * Tipos del formulario de calificación por etapa (F4, docs/02-reglas-negocio.md
 * "Puntuación" + docs/04-formularios-semaforo.md). El backend real (M7,
 * docs/06-modulos-backend.md) todavía no define un modelo Prisma para esto
 * -- no hay tabla de preguntas/opciones ni endpoint de formularios. La
 * definición de preguntas/opciones/pesos que consume este tipo vive en
 * `funcionalidades/leads/detalle/formulariosEtapa.ts` (mock) y es una
 * propuesta de diseño propia del frontend, no un contrato ya fijado por
 * backend -- ver la nota de progreso de F4 en `docs/07-modulos-frontend.md`.
 */
import type { EtapaLead } from "./lead";

/** Solo las etapas con formulario calificable tienen puntuación (docs/02, "Puntuación"). */
export type EtapaCalificable = Extract<EtapaLead, "NUEVO" | "CONTACTADO" | "CITA">;

/** Una opción de respuesta con su puntaje 0-10 (docs/02, fórmula de puntuación). */
export interface OpcionRespuesta {
  /** Clave estable de la opción (ej. "SI", "PARCIAL", "NO"), no el texto visible. */
  valor: string;
  /** Texto visible en español. */
  etiqueta: string;
  /** 0-10. */
  puntaje: number;
}

export interface PreguntaFormulario {
  /** Clave estable de la pregunta (ej. "contactabilidad"). */
  clave: string;
  /** Texto visible en español. */
  etiqueta: string;
  /** Peso de la pregunta dentro del formulario de su etapa. */
  peso: number;
  opciones: OpcionRespuesta[];
}

export interface FormularioEtapa {
  etapa: EtapaCalificable;
  preguntas: PreguntaFormulario[];
}

/** Respuestas del usuario: clave de pregunta -> `valor` de la opción elegida. */
export type RespuestasFormulario = Record<string, string>;
