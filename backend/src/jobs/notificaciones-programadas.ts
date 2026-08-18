import { enviarRecordatoriosCita } from "../services/citas-recordatorio.service.js";
import { detectLeadsAtrasados } from "../services/sla-atrasado.service.js";

/**
 * Productores programados registrados por el runtime de M8. Mantener este
 * registro explícito permite ejecutar el límite completo sin inventar un
 * productor de expiración mientras M4 no persista ese ciclo de vida.
 */
export const scheduledNotificationProducers = {
  sla: detectLeadsAtrasados,
  appointments: enviarRecordatoriosCita,
} as const;
