import { logger } from "../lib/logger.js";
import type { ResultadoDeteccion } from "../services/sla-atrasado.service.js";
import { scheduledNotificationProducers } from "./notificaciones-programadas.js";

export const INTERVALO_SLA_MS = 15 * 60 * 1000;

export type { ResultadoDeteccion } from "../services/sla-atrasado.service.js";

/**
 * D2(ii)/(iii) (diseño M6) — guarda de re-entrada por flag en closure:
 * `setInterval` no espera a la promesa anterior, así que un ciclo aún en
 * curso descarta el siguiente disparo en vez de solaparse. Solo `index.ts`
 * la invoca; `app.ts` no la conoce, así la suite de integración monta la
 * app sin timers vivos. `unref()` evita que un import accidental en pruebas
 * retenga el proceso.
 *
 * Este archivo NO contiene la regla de negocio (§4 AGENTS.md, "la lógica de
 * negocio vive en services") — solo el wiring del intervalo. La detección en
 * sí vive en `services/sla-atrasado.service.ts::detectLeadsAtrasados`.
 *
 * `detectar` es un seam de testabilidad: por defecto es la función real
 * `detectLeadsAtrasados`, así que `index.ts` la invoca exactamente como el
 * diseño especifica. Una prueba con temporizadores falsos puede inyectar un
 * mock para verificar la guarda de re-entrada sin tocar la base de datos ni
 * depender de la resolución interna de bindings de ESM.
 */
export function startSlaAtrasadoJob(
  intervaloMs: number = INTERVALO_SLA_MS,
  detectar: (ahora?: Date) => Promise<ResultadoDeteccion> = scheduledNotificationProducers.sla,
): NodeJS.Timeout {
  let enCurso = false;
  const timer = setInterval(() => {
    if (enCurso) {
      logger.warn("sla-atrasado: tick omitido, la ejecucion anterior sigue en curso");
      return;
    }
    enCurso = true;
    detectar()
      .then((resultado) => logger.info(resultado, "sla-atrasado: tick completado"))
      .catch((err: unknown) => logger.error({ err }, "sla-atrasado: fallo en el tick"))
      .finally(() => {
        enCurso = false;
      });
  }, intervaloMs);
  timer.unref();
  return timer;
}
