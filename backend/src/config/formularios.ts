import type { EtapaLead } from "@prisma/client";

/**
 * Contrato técnico exacto de `docs/04-formularios-semaforo.md` §9. Los
 * formularios son fijos y no personalizables en el MVP (D12, propuesta M5):
 * viven aquí, aislados del resto del código, para que una futura migración a
 * configuración por base de datos no toque la lógica del embudo.
 */
export interface OpcionRespuesta {
  clave: string;
  etiqueta: string;
  valor: number; // 0-10
}

export interface PreguntaFormulario {
  clave: string;
  etiqueta: string;
  peso: number;
  opciones: OpcionRespuesta[];
}

export interface FormularioEtapa {
  etapa: EtapaLead;
  /** Se persiste en `respuestas_formulario.version_rubrica` (D12). */
  version: string;
  /** `false` en VENTA y NO_VENTA (D6): son resultados, no pronósticos. */
  calificable: boolean;
  preguntas: PreguntaFormulario[];
}

/** docs/04 §3 — Etapa NUEVO. Peso total: 11. */
const FORMULARIO_NUEVO: FormularioEtapa = {
  etapa: "NUEVO",
  version: "v1",
  calificable: true,
  preguntas: [
    {
      clave: "contacto_logrado",
      etiqueta: "¿Se logró contactar al lead?",
      peso: 3,
      opciones: [
        { clave: "si_respondio", etiqueta: "Sí, respondió", valor: 10 },
        { clave: "si_no_pudo_hablar", etiqueta: "Sí, pero no pudo hablar", valor: 6 },
        { clave: "no_respondio_primer_intento", etiqueta: "No respondió, 1er intento", valor: 3 },
        { clave: "numero_invalido", etiqueta: "Número inválido o inexistente", valor: 0 },
      ],
    },
    {
      clave: "reconoce_formulario",
      etiqueta: "¿Reconoce haber llenado el formulario del anuncio?",
      peso: 2,
      opciones: [
        { clave: "si_con_claridad", etiqueta: "Sí, con claridad", valor: 10 },
        { clave: "si_vagamente", etiqueta: "Sí, vagamente", valor: 5 },
        { clave: "no_lo_recuerda", etiqueta: "No lo recuerda", valor: 2 },
        { clave: "niega_haberlo_llenado", etiqueta: "Niega haberlo llenado", valor: 0 },
      ],
    },
    {
      clave: "nivel_interes",
      etiqueta: "Nivel de interés declarado en el producto o servicio",
      peso: 3,
      opciones: [
        { clave: "interes_alto_concreto", etiqueta: "Interés alto y concreto", valor: 10 },
        { clave: "interes_general", etiqueta: "Interés general", valor: 6 },
        { clave: "solo_curiosidad", etiqueta: "Solo curiosidad", valor: 3 },
        { clave: "ninguno", etiqueta: "Ninguno", valor: 0 },
      ],
    },
    {
      clave: "plazo_decision",
      etiqueta: "Plazo en que evalúa decidir",
      peso: 2,
      opciones: [
        { clave: "inmediato_menos_1_semana", etiqueta: "Inmediato, menos de 1 semana", valor: 10 },
        { clave: "este_mes", etiqueta: "Este mes", valor: 7 },
        { clave: "uno_a_tres_meses", etiqueta: "Uno a tres meses", valor: 4 },
        { clave: "sin_plazo_definido", etiqueta: "Sin plazo definido", valor: 1 },
      ],
    },
    {
      clave: "toma_decision",
      etiqueta: "¿Es quien toma la decisión?",
      peso: 1,
      opciones: [
        { clave: "si", etiqueta: "Sí", valor: 10 },
        { clave: "decide_con_alguien_mas", etiqueta: "Decide con alguien más", valor: 6 },
        { clave: "consulta_tercero", etiqueta: "No, consulta a un tercero", valor: 2 },
      ],
    },
  ],
};

/** docs/04 §4 — Etapa CONTACTADO. Peso total: 13. */
const FORMULARIO_CONTACTADO: FormularioEtapa = {
  etapa: "CONTACTADO",
  version: "v1",
  calificable: true,
  preguntas: [
    {
      clave: "medio_contacto",
      etiqueta: "Medio por el que se concretó el contacto",
      peso: 1,
      opciones: [
        { clave: "llamada_telefonica", etiqueta: "Llamada telefónica", valor: 10 },
        { clave: "videollamada", etiqueta: "Videollamada", valor: 10 },
        { clave: "mensajeria", etiqueta: "Mensajería", valor: 6 },
        { clave: "correo", etiqueta: "Correo", valor: 4 },
      ],
    },
    {
      clave: "resultado_conversacion",
      etiqueta: "Resultado de la conversación",
      peso: 3,
      opciones: [
        { clave: "solicita_avanzar_cotizar", etiqueta: "Solicita avanzar o cotizar", valor: 10 },
        { clave: "pide_informacion_adicional", etiqueta: "Pide información adicional", valor: 7 },
        { clave: "escucho_sin_comprometerse", etiqueta: "Escuchó sin comprometerse", valor: 4 },
        { clave: "rechazo_explicitamente", etiqueta: "Rechazó explícitamente", valor: 0 },
      ],
    },
    {
      clave: "necesidad_identificada",
      etiqueta: "Necesidad identificada respecto de la oferta",
      peso: 3,
      opciones: [
        { clave: "encaja_con_precision", etiqueta: "Encaja con precisión", valor: 10 },
        { clave: "encaja_parcialmente", etiqueta: "Encaja parcialmente", valor: 6 },
        { clave: "encaje_dudoso", etiqueta: "Encaje dudoso", valor: 3 },
        { clave: "no_encaja", etiqueta: "No encaja", valor: 0 },
      ],
    },
    {
      clave: "capacidad_pago",
      etiqueta: "Capacidad de pago o presupuesto",
      peso: 2,
      opciones: [
        { clave: "confirmada_suficiente", etiqueta: "Confirmada y suficiente", valor: 10 },
        {
          clave: "estimada_probablemente_suficiente",
          etiqueta: "Estimada, probablemente suficiente",
          valor: 7,
        },
        { clave: "ajustada", etiqueta: "Ajustada", valor: 4 },
        { clave: "insuficiente_o_no_habla", etiqueta: "Insuficiente o se niega a hablarlo", valor: 1 },
      ],
    },
    {
      clave: "objecion_principal",
      etiqueta: "Objeción principal manifestada",
      peso: 2,
      opciones: [
        { clave: "ninguna", etiqueta: "Ninguna", valor: 10 },
        { clave: "precio", etiqueta: "Precio", valor: 6 },
        { clave: "momento_inoportuno", etiqueta: "Momento inoportuno", valor: 5 },
        { clave: "comparando_competidores", etiqueta: "Comparando competidores", valor: 5 },
        { clave: "desconfianza_marca", etiqueta: "Desconfianza en la marca", valor: 3 },
        { clave: "no_la_expreso", etiqueta: "No la expresó", valor: 4 },
      ],
    },
    {
      clave: "proxima_accion",
      etiqueta: "Próxima acción acordada con el lead",
      peso: 2,
      opciones: [
        { clave: "cita_agendada", etiqueta: "Cita agendada", valor: 10 },
        { clave: "volver_a_contactar_con_fecha", etiqueta: "Volver a contactar con fecha", valor: 7 },
        { clave: "volver_a_contactar_sin_fecha", etiqueta: "Volver a contactar sin fecha", valor: 3 },
        { clave: "ninguna_accion", etiqueta: "Ninguna", valor: 0 },
      ],
    },
  ],
};

/** docs/04 §5 — Etapa CITA. Peso total: 14. */
const FORMULARIO_CITA: FormularioEtapa = {
  etapa: "CITA",
  version: "v1",
  calificable: true,
  preguntas: [
    {
      clave: "asistio_cita",
      etiqueta: "¿Asistió a la cita?",
      peso: 3,
      opciones: [
        { clave: "si_puntual", etiqueta: "Sí, puntual", valor: 10 },
        { clave: "si_reprogramada_una_vez", etiqueta: "Sí, reprogramada una vez", valor: 7 },
        { clave: "reprogramada_dos_o_mas", etiqueta: "Reprogramada dos o más veces", valor: 3 },
        { clave: "no_asistio_sin_aviso", etiqueta: "No asistió sin aviso", valor: 0 },
      ],
    },
    {
      clave: "participo_decisor",
      etiqueta: "¿Participó quien toma la decisión?",
      peso: 2,
      opciones: [
        { clave: "si", etiqueta: "Sí", valor: 10 },
        { clave: "participo_parcialmente", etiqueta: "Participó parcialmente", valor: 6 },
        { clave: "no_solo_intermediario", etiqueta: "No, solo un intermediario", valor: 2 },
      ],
    },
    {
      clave: "presupuesto_validado",
      etiqueta: "Presupuesto validado durante la reunión",
      peso: 3,
      opciones: [
        { clave: "confirmado_suficiente", etiqueta: "Confirmado y suficiente", valor: 10 },
        { clave: "suficiente_con_ajustes", etiqueta: "Suficiente con ajustes", valor: 7 },
        { clave: "por_debajo_de_lo_requerido", etiqueta: "Por debajo de lo requerido", valor: 3 },
        { clave: "no_se_pudo_validar", etiqueta: "No se pudo validar", valor: 2 },
      ],
    },
    {
      clave: "reaccion_propuesta",
      etiqueta: "Reacción a la propuesta presentada",
      peso: 3,
      opciones: [
        { clave: "aceptacion_explicita", etiqueta: "Aceptación explícita", valor: 10 },
        { clave: "interes_con_condiciones", etiqueta: "Interés con condiciones", valor: 7 },
        { clave: "neutral_pide_pensarlo", etiqueta: "Neutral, pide pensarlo", valor: 4 },
        { clave: "rechazo", etiqueta: "Rechazo", valor: 0 },
      ],
    },
    {
      clave: "proximo_paso_comprometido",
      etiqueta: "Próximo paso comprometido",
      peso: 2,
      opciones: [
        { clave: "firma_o_pago_con_fecha", etiqueta: "Firma o pago acordado con fecha", valor: 10 },
        { clave: "segunda_reunion_agendada", etiqueta: "Segunda reunión agendada", valor: 7 },
        { clave: "espera_respuesta_sin_fecha", etiqueta: "Espera respuesta sin fecha", valor: 3 },
        { clave: "ninguno", etiqueta: "Ninguno", valor: 0 },
      ],
    },
    {
      clave: "competidores_en_evaluacion",
      etiqueta: "Competidores en evaluación",
      peso: 1,
      opciones: [
        { clave: "ninguno", etiqueta: "Ninguno", valor: 10 },
        { clave: "uno", etiqueta: "Uno", valor: 6 },
        { clave: "varios", etiqueta: "Varios", valor: 3 },
        { clave: "ya_tiene_oferta_de_otro", etiqueta: "Ya tiene oferta de otro", valor: 1 },
      ],
    },
  ],
};

/**
 * docs/04 §6 — Etapa VENTA. Registro de cierre sin puntuación: el semáforo
 * queda 🟢 por definición (D6). Los campos obligatorios de este registro
 * (fecha de cierre, monto, producto/servicio, forma de pago — D13) viven en
 * columnas dedicadas de `Lead` y se validan con el schema Zod de PR3
 * (`patchEtapaBodySchema`), no como `PreguntaFormulario` de este contrato.
 */
const FORMULARIO_VENTA: FormularioEtapa = {
  etapa: "VENTA",
  version: "v1",
  calificable: false,
  preguntas: [],
};

/**
 * docs/04 §7 — Etapa NO VENTA. Registro de cierre sin puntuación: el
 * semáforo queda 🔴 por definición (D6). Igual que VENTA, sus campos
 * obligatorios (fecha de cierre, observación ≥20 caracteres — D13) se
 * validan en el schema Zod de PR3.
 */
const FORMULARIO_NO_VENTA: FormularioEtapa = {
  etapa: "NO_VENTA",
  version: "v1",
  calificable: false,
  preguntas: [],
};

/** Rúbrica completa, indexada por etapa (docs/04 §3-§7). */
export const FORMULARIOS: Readonly<Record<EtapaLead, FormularioEtapa>> = {
  NUEVO: FORMULARIO_NUEVO,
  CONTACTADO: FORMULARIO_CONTACTADO,
  CITA: FORMULARIO_CITA,
  VENTA: FORMULARIO_VENTA,
  NO_VENTA: FORMULARIO_NO_VENTA,
};

export function getFormulario(etapa: EtapaLead): FormularioEtapa {
  return FORMULARIOS[etapa];
}
