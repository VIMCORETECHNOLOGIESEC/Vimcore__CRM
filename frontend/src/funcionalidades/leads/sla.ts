/**
 * Cálculo del estado de SLA de un lead (docs/02-reglas-negocio.md §7).
 *
 * Cobertura de TDD (AGENTS.md §5): lógica de formateo de tiempo y umbrales
 * -- ver `frontend/tests/leads/sla.test.ts`. Puro, sin efectos secundarios;
 * el reloj en vivo vive en `useSlaCountdown.ts`, que solo re-invoca estas
 * funciones cada segundo.
 *
 * IMPORTANTE: el estado de SLA **nunca se persiste ni se consulta al
 * servidor cada segundo** (docs/07 F3, nota explícita). Se deriva en el
 * cliente a partir de `slaInicioEn`, exactamente como lo hace el backend
 * (M6) a partir de la misma columna -- ambos cálculos deben coincidir
 * porque comparten la misma fórmula documentada aquí.
 */

/** Plazo por defecto, constante `SLA_HORAS` en `backend/src/config/negocio.ts`. */
export const SLA_HORAS = 24;
const SLA_MS = SLA_HORAS * 60 * 60 * 1000;

/** "Queda 25% o menos del plazo" -> en riesgo (docs/02 §7). */
const UMBRAL_RIESGO_FRACCION = 0.25;

export type EstadoSlaCalculado = "A_TIEMPO" | "EN_RIESGO" | "ATRASADO" | "CERRADO";

export interface CalculoSla {
  estado: EstadoSlaCalculado;
  /** Texto ya listo para mostrar, ej. `"En riesgo (06:00:00)"`, `"Cerrado"`. */
  etiqueta: string;
  /** Milisegundos restantes hasta el vencimiento; negativo si está atrasado. */
  restanteMs: number;
}

/** `ms` sin truncar signo -- llamar siempre con `Math.abs()` si el origen puede ser negativo. */
export function formatDuracionHms(ms: number): string {
  const totalSegundos = Math.floor(ms / 1000);
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  const segundos = totalSegundos % 60;
  const pad = (valor: number) => String(valor).padStart(2, "0");
  return `${pad(horas)}:${pad(minutos)}:${pad(segundos)}`;
}

interface CalcularEstadoSlaParams {
  slaInicioEn: string | null;
  cerradoEn: string | null;
  /** Inyectable para tests deterministas; por defecto `new Date()`. */
  ahora?: Date;
}

export function calculateEstadoSla({
  slaInicioEn,
  cerradoEn,
  ahora = new Date(),
}: CalcularEstadoSlaParams): CalculoSla {
  if (cerradoEn || !slaInicioEn) {
    return { estado: "CERRADO", etiqueta: "Cerrado", restanteMs: 0 };
  }

  const inicioMs = new Date(slaInicioEn).getTime();
  const transcurridoMs = ahora.getTime() - inicioMs;
  const restanteMs = SLA_MS - transcurridoMs;

  let estado: EstadoSlaCalculado;
  if (restanteMs <= 0) {
    estado = "ATRASADO";
  } else if (restanteMs <= SLA_MS * UMBRAL_RIESGO_FRACCION) {
    estado = "EN_RIESGO";
  } else {
    estado = "A_TIEMPO";
  }

  const duracionTexto = formatDuracionHms(Math.abs(restanteMs));
  const etiqueta =
    estado === "ATRASADO"
      ? `Atrasado (-${duracionTexto})`
      : estado === "EN_RIESGO"
        ? `En riesgo (${duracionTexto})`
        : `A tiempo (${duracionTexto})`;

  return { estado, etiqueta, restanteMs };
}
