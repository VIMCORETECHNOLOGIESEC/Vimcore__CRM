import { logger } from "./logger.js";
import { eventBroker } from "./event-broker.js";

/**
 * M9 (docs/08-dashboard-kpis.md §5, "Actualización en tiempo real", nota de
 * rendimiento): agrupa reemisiones de métricas en ventanas de 2 segundos —
 * un ingreso masivo de leads (o una racha de asignaciones/transiciones) no
 * debe emitir un `metricas.actualizadas` por cada evento de negocio
 * individual. A diferencia de los jobs recurrentes del repo
 * (`bridge-mudo.job.ts`, `sla-atrasado.job.ts`), esto NO es un intervalo que
 * se re-arma solo: es un debounce de ventana fija — la primera llamada abre
 * la ventana, las siguientes dentro de esos 2s son no-op, y tras el disparo
 * la siguiente llamada abre una ventana nueva.
 */
export const METRICAS_BROADCAST_WINDOW_MS = 2000;

let timer: NodeJS.Timeout | undefined;

export function scheduleMetricasBroadcast(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    try {
      eventBroker.broadcastAll("metricas.actualizadas", {});
    } catch (error) {
      // Un fallo al emitir el broadcast de métricas nunca debe tirar el
      // proceso (no hay handler de `uncaughtException` a nivel proceso) ni
      // afectar nada más — mismo criterio degradante que `registrarLogSeguro`
      // / `touchUltimoLeadEnSeguro` (`ingesta.service.ts`).
      logger.error({ err: error }, "metricas-broadcast: fallo al emitir metricas.actualizadas");
    }
  }, METRICAS_BROADCAST_WINDOW_MS);
  timer.unref();
}

/**
 * Test-only: limpia el estado de módulo (`timer`) entre archivos de prueba
 * que usan `vi.useFakeTimers()` sobre este singleton, evitando que una
 * ventana pendiente de un test anterior contamine el siguiente.
 */
export function __resetMetricasBroadcastForTests(): void {
  clearTimeout(timer);
  timer = undefined;
}
