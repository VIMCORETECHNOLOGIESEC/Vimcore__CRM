import type { Semaforo } from "@prisma/client";
import { UMBRAL_AMARILLO, UMBRAL_VERDE } from "../config/negocio.js";
import type { FormularioEtapa } from "../config/formularios.js";

export interface PuntuacionResult {
  puntuacion: number;
  semaforo: Semaforo;
}

/**
 * DD3 (diseño M5): motor de puntuación puro — cero imports de Prisma/
 * repositorios en tiempo de ejecución (`Semaforo` se importa solo como
 * tipo), espejo de `deduplicacion.decider.ts`. Prueba obligatoria 3
 * (docs/06 §M5): corre sin base de datos.
 *
 * Fórmula (docs/04 §2, D7 de la propuesta):
 *   Σ(peso × valor de la opción elegida) / Σ(peso × 10) × 100
 *
 * El denominador es el peso TOTAL del formulario (todas las preguntas),
 * nunca solo las preguntas respondidas — así una pregunta omitida en el
 * body contribuye 0 al numerador pero sigue contando en el denominador
 * (D7: el cliente no puede inflar el promedio omitiendo preguntas
 * desfavorables). Una `claveOpcion` que no exista entre las opciones de su
 * pregunta también contribuye 0, nunca lanza — el motor solo confía en las
 * claves de `config/formularios.ts`, nunca en valores del body (D7).
 */
export function calculatePuntuacion(
  formulario: FormularioEtapa,
  respuestas: Record<string, string>,
): PuntuacionResult {
  let numerador = 0;
  let denominador = 0;

  for (const pregunta of formulario.preguntas) {
    denominador += pregunta.peso * 10;

    const claveElegida = respuestas[pregunta.clave];
    if (claveElegida === undefined) continue;

    const opcion = pregunta.opciones.find((o) => o.clave === claveElegida);
    if (opcion === undefined) continue;

    numerador += pregunta.peso * opcion.valor;
  }

  const puntuacion = denominador === 0 ? 0 : Math.round((numerador / denominador) * 100);

  return { puntuacion, semaforo: colorFrom(puntuacion) };
}

function colorFrom(puntuacion: number): Semaforo {
  if (puntuacion >= UMBRAL_VERDE) return "VERDE";
  if (puntuacion >= UMBRAL_AMARILLO) return "AMARILLO";
  return "ROJO";
}
