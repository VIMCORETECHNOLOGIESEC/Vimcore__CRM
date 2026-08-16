import type { EtapaCalificable, FormularioEtapa } from "@/tipos/formulario";

/**
 * Definición de preguntas/opciones/pesos de los 3 formularios calificables
 * (docs/02-reglas-negocio.md "Puntuación", pesos totales documentados: NUEVO
 * 11, CONTACTADO 13, CITA 14). El backend (M7) no tiene todavía un modelo de
 * preguntas -- esta es una **propuesta de diseño del frontend**, no un
 * contrato ya fijado: cada pregunta tiene 3 opciones ("Sí" = 10, "Parcial" =
 * 5, "No" = 0) salvo donde el sentido de la pregunta pide otra escala (ver
 * comentarios puntuales). Documentado también en la nota de progreso F4 de
 * `docs/07-modulos-frontend.md`.
 */

const OPCIONES_SI_PARCIAL_NO = [
  { valor: "SI", etiqueta: "Sí", puntaje: 10 },
  { valor: "PARCIAL", etiqueta: "Parcial", puntaje: 5 },
  { valor: "NO", etiqueta: "No", puntaje: 0 },
];

const FORMULARIO_NUEVO: FormularioEtapa = {
  etapa: "NUEVO",
  preguntas: [
    { clave: "contactabilidad", etiqueta: "¿El contacto es localizable?", peso: 3, opciones: OPCIONES_SI_PARCIAL_NO },
    {
      clave: "reconocimientoAnuncio",
      etiqueta: "¿Reconoce el anuncio o campaña de origen?",
      peso: 2,
      opciones: OPCIONES_SI_PARCIAL_NO,
    },
    {
      clave: "interesDeclarado",
      etiqueta: "¿Declaró interés concreto en el producto/servicio?",
      peso: 3,
      opciones: OPCIONES_SI_PARCIAL_NO,
    },
    {
      clave: "plazoDecision",
      etiqueta: "¿Tiene un plazo de decisión definido?",
      peso: 2,
      opciones: [
        { valor: "INMEDIATO", etiqueta: "Inmediato (menos de 30 días)", puntaje: 10 },
        { valor: "MEDIANO", etiqueta: "Mediano plazo (1-3 meses)", puntaje: 5 },
        { valor: "SIN_PLAZO", etiqueta: "Sin plazo definido", puntaje: 0 },
      ],
    },
    {
      clave: "esQuienDecide",
      etiqueta: "¿Es quien toma la decisión de compra?",
      peso: 1,
      opciones: OPCIONES_SI_PARCIAL_NO,
    },
  ],
};

const FORMULARIO_CONTACTADO: FormularioEtapa = {
  etapa: "CONTACTADO",
  preguntas: [
    {
      clave: "medioContacto",
      etiqueta: "¿El medio de contacto usado fue efectivo?",
      peso: 1,
      opciones: OPCIONES_SI_PARCIAL_NO,
    },
    {
      clave: "resultadoConversacion",
      etiqueta: "¿Cómo resultó la conversación?",
      peso: 3,
      opciones: [
        { valor: "POSITIVA", etiqueta: "Positiva, con siguiente paso acordado", puntaje: 10 },
        { valor: "NEUTRA", etiqueta: "Neutra, sin definiciones", puntaje: 5 },
        { valor: "NEGATIVA", etiqueta: "Negativa o sin interés", puntaje: 0 },
      ],
    },
    {
      clave: "necesidadIdentificada",
      etiqueta: "¿Se identificó una necesidad concreta?",
      peso: 3,
      opciones: OPCIONES_SI_PARCIAL_NO,
    },
    {
      clave: "capacidadPago",
      etiqueta: "¿Muestra capacidad de pago para el producto/servicio?",
      peso: 2,
      opciones: OPCIONES_SI_PARCIAL_NO,
    },
    {
      clave: "objecionPrincipal",
      etiqueta: "¿Tiene una objeción principal identificada y manejable?",
      peso: 2,
      opciones: OPCIONES_SI_PARCIAL_NO,
    },
    {
      clave: "proximaAccionAcordada",
      etiqueta: "¿Quedó una próxima acción acordada con fecha?",
      peso: 2,
      opciones: OPCIONES_SI_PARCIAL_NO,
    },
  ],
};

const FORMULARIO_CITA: FormularioEtapa = {
  etapa: "CITA",
  preguntas: [
    { clave: "asistencia", etiqueta: "¿Asistió a la cita?", peso: 3, opciones: OPCIONES_SI_PARCIAL_NO },
    {
      clave: "participacionDecisor",
      etiqueta: "¿Participó quien decide la compra?",
      peso: 2,
      opciones: OPCIONES_SI_PARCIAL_NO,
    },
    {
      clave: "presupuestoValidado",
      etiqueta: "¿Se validó el presupuesto disponible?",
      peso: 3,
      opciones: OPCIONES_SI_PARCIAL_NO,
    },
    {
      clave: "reaccionPropuesta",
      etiqueta: "¿Cómo reaccionó a la propuesta presentada?",
      peso: 3,
      opciones: [
        { valor: "POSITIVA", etiqueta: "Positiva", puntaje: 10 },
        { valor: "DUDOSA", etiqueta: "Dudosa", puntaje: 5 },
        { valor: "NEGATIVA", etiqueta: "Negativa", puntaje: 0 },
      ],
    },
    {
      clave: "proximoPasoComprometido",
      etiqueta: "¿Quedó comprometido un próximo paso?",
      peso: 2,
      opciones: OPCIONES_SI_PARCIAL_NO,
    },
    {
      clave: "competidores",
      etiqueta: "¿Está evaluando activamente a la competencia?",
      peso: 1,
      opciones: [
        { valor: "NO", etiqueta: "No", puntaje: 10 },
        { valor: "PARCIAL", etiqueta: "Lo está considerando", puntaje: 5 },
        { valor: "SI", etiqueta: "Sí, en evaluación activa", puntaje: 0 },
      ],
    },
  ],
};

const FORMULARIOS_ETAPA: Record<EtapaCalificable, FormularioEtapa> = {
  NUEVO: FORMULARIO_NUEVO,
  CONTACTADO: FORMULARIO_CONTACTADO,
  CITA: FORMULARIO_CITA,
};

export function getFormularioEtapa(etapa: EtapaCalificable): FormularioEtapa {
  return FORMULARIOS_ETAPA[etapa];
}

export const ETAPAS_CALIFICABLES: EtapaCalificable[] = ["NUEVO", "CONTACTADO", "CITA"];

export function isEtapaCalificable(etapa: string): etapa is EtapaCalificable {
  return (ETAPAS_CALIFICABLES as string[]).includes(etapa);
}
