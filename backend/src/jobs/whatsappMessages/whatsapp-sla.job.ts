import { logger } from "../../lib/logger.js";
import {
  detectarConversacionesAtrasadas,
  type ResultadoReasignacionSla,
} from "../../services/whatsappMessages/whatsapp-sla.service.js";

/**
 * rule 3 (batch whatsappMessages): tick cada 10 minutos — dentro del rango
 * sugerido (5-10 min) por el brief, mismo orden de magnitud que
 * `sla-atrasado.job.ts`/`bridge-mudo.job.ts` (15 min) pero más frecuente,
 * porque acá el efecto es una reasignación real (no solo una notificación) y
 * `SLA_HORAS` (`config/negocio.ts`) es más corto en términos relativos.
 */
export const INTERVALO_WHATSAPP_SLA_MS = 10 * 60 * 1000;

export type { ResultadoReasignacionSla } from "../../services/whatsappMessages/whatsapp-sla.service.js";

/**
 * Mismo patrón D2(ii)/(iii) que `sla-atrasado.job.ts`/`bridge-mudo.job.ts`:
 * guarda de re-entrada por flag en closure, `unref()`, `detectar` como seam
 * de testabilidad. Solo `index.ts` la invoca — `app.ts` no la conoce, así la
 * suite de integración monta la app sin timers vivos.
 */
export function startWhatsAppSlaJob(
  intervaloMs: number = INTERVALO_WHATSAPP_SLA_MS,
  detectar: (ahora?: Date) => Promise<ResultadoReasignacionSla> = detectarConversacionesAtrasadas,
): NodeJS.Timeout {
  let enCurso = false;
  const timer = setInterval(() => {
    if (enCurso) {
      logger.warn("whatsapp-sla: tick omitido, la ejecucion anterior sigue en curso");
      return;
    }
    enCurso = true;
    detectar()
      .then((resultado) => logger.info(resultado, "whatsapp-sla: tick completado"))
      .catch((err: unknown) => logger.error({ err }, "whatsapp-sla: fallo en el tick"))
      .finally(() => {
        enCurso = false;
      });
  }, intervaloMs);
  timer.unref();
  return timer;
}
