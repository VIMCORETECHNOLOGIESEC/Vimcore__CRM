import { logger } from "../lib/logger.js";
import {
  type ResultadoRecordatorioCitas,
} from "../services/citas-recordatorio.service.js";
import { scheduledNotificationProducers } from "./notificaciones-programadas.js";

/**
 * Cambio de ventana (feature aditiva post-M7): la ventana de recordatorio
 * dejó de ser "próxima 1h" (`VENTANA_RECORDATORIO_MS`, M7 original) y pasó a
 * ser "todo el día calendario de MAÑANA en hora Ecuador"
 * (`citas-recordatorio.service.ts::enviarRecordatoriosCita`, vía
 * `lib/rango-fechas.ts::rangoManianaEcuador`) — una ventana de 24h no
 * necesita un tick cada 15 minutos para dar un margen aceptable; 5h alcanza
 * de sobra (peor caso: hasta 5h de demora sobre el instante exacto en el que
 * una cita entra en la ventana de "mañana", frente a una ventana total de
 * ~24-48h de anticipación real del recordatorio).
 */
export const INTERVALO_RECORDATORIO_CITA_MS = 5 * 60 * 60 * 1000;

export type { ResultadoRecordatorioCitas } from "../services/citas-recordatorio.service.js";

/**
 * D2(ii)/(iii) de M6, mismo patrón: guarda de re-entrada por flag en closure
 * — un tick aún en curso descarta el siguiente disparo en vez de solaparse.
 * Solo `index.ts` la invoca; `app.ts` no la conoce (la suite de integración
 * monta la app sin timers vivos). `unref()` evita que un import accidental en
 * pruebas retenga el proceso.
 *
 * `enviar` es un seam de testabilidad (igual que `detectar` en
 * `sla-atrasado.job.ts`): por defecto la función real
 * `enviarRecordatoriosCita`, inyectable en pruebas con temporizadores falsos.
 */
export function startCitasRecordatorioJob(
  intervaloMs: number = INTERVALO_RECORDATORIO_CITA_MS,
  enviar: (ahora?: Date) => Promise<ResultadoRecordatorioCitas> =
    scheduledNotificationProducers.citas,
): NodeJS.Timeout {
  let enCurso = false;
  const timer = setInterval(() => {
    if (enCurso) {
      logger.warn("citas-recordatorio: tick omitido, la ejecucion anterior sigue en curso");
      return;
    }
    enCurso = true;
    enviar()
      .then((resultado) => logger.info(resultado, "citas-recordatorio: tick completado"))
      .catch((err: unknown) => logger.error({ err }, "citas-recordatorio: fallo en el tick"))
      .finally(() => {
        enCurso = false;
      });
  }, intervaloMs);
  timer.unref();
  return timer;
}
