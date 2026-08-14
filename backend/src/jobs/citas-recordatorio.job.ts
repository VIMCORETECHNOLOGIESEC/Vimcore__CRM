import { logger } from "../lib/logger.js";
import {
  enviarRecordatoriosCita,
  type ResultadoRecordatorioCitas,
} from "../services/citas-recordatorio.service.js";

/**
 * Mismo intervalo que `sla-atrasado.job.ts` (M6, `INTERVALO_SLA_MS`):
 * independiente, no se deriva de él. 15 minutos da un margen aceptable frente
 * a una ventana de recordatorio de 1h (peor caso: hasta 15 minutos de
 * demora sobre el instante exacto en el que la cita entra en la ventana).
 */
export const INTERVALO_RECORDATORIO_CITA_MS = 15 * 60 * 1000;

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
  enviar: (ahora?: Date) => Promise<ResultadoRecordatorioCitas> = enviarRecordatoriosCita,
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
