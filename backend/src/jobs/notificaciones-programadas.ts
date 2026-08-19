import { detectarBridgesMudos } from "../services/bridge-mudo.service.js";
import { enviarRecordatoriosCita } from "../services/citas-recordatorio.service.js";
import { detectLeadsAtrasados } from "../services/sla-atrasado.service.js";
import { verificarTokensVigentes } from "../services/verificacion-token.service.js";

/**
 * Productores programados registrados por el runtime de M8. Mantener este
 * registro explícito permite ejecutar el límite completo sin inventar un
 * productor de expiración mientras M4 no persista ese ciclo de vida.
 */
export const scheduledNotificationProducers = {
  sla: detectLeadsAtrasados,
  appointments: enviarRecordatoriosCita,
  bridgeMudo: detectarBridgesMudos,
  verificacionToken: verificarTokensVigentes,
} as const;
