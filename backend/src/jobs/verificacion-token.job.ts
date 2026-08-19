import { logger } from "../lib/logger.js";
import type { ResultadoVerificacionToken } from "../services/verificacion-token.service.js";
import { scheduledNotificationProducers } from "./notificaciones-programadas.js";

/** Verificación diaria (docs/05-bridges.md §3) — a diferencia de sla/citas/bridge-mudo, este ciclo es de 24h. */
export const INTERVALO_VERIFICACION_TOKEN_MS = 24 * 60 * 60 * 1000;

export type { ResultadoVerificacionToken } from "../services/verificacion-token.service.js";

/**
 * Mismo patrón que `bridge-mudo.job.ts`/`sla-atrasado.job.ts`: guarda de
 * re-entrada por flag en closure, `unref()` para no retener el proceso, seam
 * de testabilidad vía el segundo parámetro. Solo `index.ts` la invoca.
 */
export function startVerificacionTokenJob(
  intervaloMs: number = INTERVALO_VERIFICACION_TOKEN_MS,
  verificar: (ahora?: Date) => Promise<ResultadoVerificacionToken> =
    scheduledNotificationProducers.verificacionToken,
): NodeJS.Timeout {
  let enCurso = false;
  const timer = setInterval(() => {
    if (enCurso) {
      logger.warn("verificacion-token: tick omitido, la ejecucion anterior sigue en curso");
      return;
    }
    enCurso = true;
    verificar()
      .then((resultado) => logger.info(resultado, "verificacion-token: tick completado"))
      .catch((err: unknown) => logger.error({ err }, "verificacion-token: fallo en el tick"))
      .finally(() => {
        enCurso = false;
      });
  }, intervaloMs);
  timer.unref();
  return timer;
}
