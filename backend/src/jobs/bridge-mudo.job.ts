import { logger } from "../lib/logger.js";
import type { ResultadoDeteccionMudos } from "../services/bridge-mudo.service.js";
import { scheduledNotificationProducers } from "./notificaciones-programadas.js";

/** Mismo intervalo que `sla-atrasado.job.ts`/`citas-recordatorio.job.ts`: independiente, no derivado. */
export const INTERVALO_BRIDGE_MUDO_MS = 15 * 60 * 1000;

export type { ResultadoDeteccionMudos } from "../services/bridge-mudo.service.js";

/**
 * D2(ii)/(iii) de M6, mismo patrón que `sla-atrasado.job.ts` y
 * `citas-recordatorio.job.ts`: guarda de re-entrada por flag en closure —
 * un tick aún en curso descarta el siguiente disparo en vez de solaparse.
 * Solo `index.ts` la invoca; `app.ts` no la conoce (la suite de integración
 * monta la app sin timers vivos). `unref()` evita que un import accidental
 * en pruebas retenga el proceso.
 *
 * `detectar` es un seam de testabilidad: por defecto la función real
 * `detectarBridgesMudos`, inyectable en pruebas con temporizadores falsos.
 */
export function startBridgeMudoJob(
  intervaloMs: number = INTERVALO_BRIDGE_MUDO_MS,
  detectar: (ahora?: Date) => Promise<ResultadoDeteccionMudos> =
    scheduledNotificationProducers.bridgeMudo,
): NodeJS.Timeout {
  let enCurso = false;
  const timer = setInterval(() => {
    if (enCurso) {
      logger.warn("bridge-mudo: tick omitido, la ejecucion anterior sigue en curso");
      return;
    }
    enCurso = true;
    detectar()
      .then((resultado) => logger.info(resultado, "bridge-mudo: tick completado"))
      .catch((err: unknown) => logger.error({ err }, "bridge-mudo: fallo en el tick"))
      .finally(() => {
        enCurso = false;
      });
  }, intervaloMs);
  timer.unref();
  return timer;
}
