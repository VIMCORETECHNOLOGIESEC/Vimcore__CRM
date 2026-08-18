import type { SemaforoLead } from "@/tipos/lead";
import type { FormularioEtapa, RespuestasFormulario } from "@/tipos/formulario";

/**
 * Cálculo de puntuación y semáforo (docs/02-reglas-negocio.md "Puntuación" y
 * "Semáforo"). Puro, sin efectos secundarios -- ver
 * `frontend/tests/leads/detalle/puntuacion.test.ts` (AGENTS.md §5: es
 * exactamente el tipo de lógica que se exige cubrir).
 *
 * Fórmula: `Σ(peso_pregunta × valor_opcion) / Σ(peso_pregunta × 10) × 100`,
 * redondeada. Preguntas sin respuesta en `respuestas` no aportan al
 * numerador pero sí se cuentan en el denominador (peso máximo posible) --
 * así un formulario incompleto puntúa más bajo, en vez de ignorarse la
 * pregunta como si no existiera.
 *
 * IMPORTANTE (aclarado en el formulario, F4): el valor que se muestra acá es
 * una previsualización calculada en el cliente antes de enviar. El valor
 * real que persiste lo calcula el backend cuando exista M7 -- ambos deben
 * coincidir porque comparten esta misma fórmula documentada.
 */
export function calculatePuntuacion(
  formulario: FormularioEtapa,
  respuestas: RespuestasFormulario,
): number {
  let numerador = 0;
  let denominador = 0;

  for (const pregunta of formulario.preguntas) {
    denominador += pregunta.peso * 10;
    const valorElegido = respuestas[pregunta.clave];
    if (!valorElegido) continue;
    const opcion = pregunta.opciones.find((o) => o.valor === valorElegido);
    if (!opcion) continue;
    numerador += pregunta.peso * opcion.puntaje;
  }

  if (denominador === 0) return 0;
  return Math.round((numerador / denominador) * 100);
}

/** Verde 70-100, amarillo 40-69, rojo 0-39 (docs/02 "Semáforo"). */
export function calculateSemaforo(puntuacion: number): SemaforoLead {
  if (puntuacion >= 70) return "VERDE";
  if (puntuacion >= 40) return "AMARILLO";
  return "ROJO";
}

/**
 * Guía de acción por color (docs/02 "Semáforo", copy fijo -- no es lógica de
 * negocio compleja, es texto de UI en español).
 */
export const GUIA_ACCION_SEMAFORO: Record<SemaforoLead, string> = {
  VERDE: "Priorizar el cierre. Concretar el siguiente paso con fecha antes de terminar el contacto.",
  AMARILLO: "Trabajar la objeción principal registrada. El objetivo del contacto es recalificar, no cerrar.",
  ROJO: "Un último intento de reenganche. Si no hay respuesta, cerrar como No Venta y dejarlo disponible para remarketing.",
};
