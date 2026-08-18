import { SLA_HORAS } from "../config/negocio.js";

/**
 * DD6 (diseño M5): estado derivado, nunca persistido — se calcula en cada
 * consulta (docs/02-reglas-negocio.md §7). `sin_iniciar` (D15) es un cuarto
 * estado explícito, distinto de `a_tiempo`/`en_riesgo`/`atrasado`.
 */
export type EstadoSla = "a_tiempo" | "en_riesgo" | "atrasado" | "sin_iniciar";

const PLAZO_MS = SLA_HORAS * 60 * 60 * 1000;
// docs/02 §7: "en riesgo" cuando queda 25% o menos del plazo.
const UMBRAL_RIESGO_MS = PLAZO_MS * 0.25;

/**
 * Pura — cero imports de Prisma/repositorios, espejo de
 * `semaforo.calculator.ts` (DD3). `cerradoEn` detiene el reloj (D-DD6): un
 * lead cerrado se calcula contra su propio instante de cierre, nunca contra
 * `ahora`, así el estado de un lead ya cerrado no sigue empeorando con el
 * paso del tiempo.
 */
export function calculateEstadoSla(
  slaInicioEn: Date | null,
  cerradoEn: Date | null,
  ahora: Date = new Date(),
): EstadoSla {
  if (slaInicioEn === null) return "sin_iniciar";

  const instanteReferencia = cerradoEn ?? ahora;
  const transcurridoMs = instanteReferencia.getTime() - slaInicioEn.getTime();
  const restanteMs = PLAZO_MS - transcurridoMs;

  if (restanteMs <= 0) return "atrasado";
  if (restanteMs <= UMBRAL_RIESGO_MS) return "en_riesgo";
  return "a_tiempo";
}

/**
 * DD6: fronteras temporales para filtrar `GET /leads?estadoSla=...` — el
 * `where` compara `sla_inicio_en` contra estas fechas en el servicio, nunca
 * recalcula columna por columna (esa es exactamente la forma del índice
 * parcial `idx_leads_sla`, `WHERE cerrado_en IS NULL`, D11).
 */
export interface FronterasSla {
  /** `slaInicioEn <= fronteraAtrasado` ⇒ atrasado. */
  fronteraAtrasado: Date;
  /** `fronteraAtrasado < slaInicioEn <= fronteraRiesgo` ⇒ en_riesgo. */
  fronteraRiesgo: Date;
}

export function slaFilterBoundaries(ahora: Date = new Date()): FronterasSla {
  return {
    fronteraAtrasado: new Date(ahora.getTime() - PLAZO_MS),
    fronteraRiesgo: new Date(ahora.getTime() - (PLAZO_MS - UMBRAL_RIESGO_MS)),
  };
}
