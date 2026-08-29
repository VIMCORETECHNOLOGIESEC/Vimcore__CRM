import { detectarBridgesMudos } from "../services/bridge-mudo.service.js";
import { enviarRecordatoriosCita } from "../services/citas-recordatorio.service.js";
import { detectLeadsAtrasados } from "../services/sla-atrasado.service.js";
import {
  produceAlertaTokenPorExpirar,
  verifyTokensVigentes,
} from "../services/verificacion-token.service.js";

/**
 * Productores programados registrados por el runtime de M8. Mantener este
 * registro explícito permite ejecutar el límite completo sin inventar un
 * productor de expiración mientras M4 no persista ese ciclo de vida.
 *
 * M-hardening Bloque A (WU5): `tokenPorExpirar` es el productor PREVENTIVO
 * (avisa antes del vencimiento) — distinto de `verificacionToken`, que
 * verifica contra Graph API si el token YA dejó de ser válido hoy.
 */
export const scheduledNotificationProducers = {
  sla: detectLeadsAtrasados,
  citas: enviarRecordatoriosCita,
  bridgeMudo: detectarBridgesMudos,
  verificacionToken: verifyTokensVigentes,
  tokenPorExpirar: produceAlertaTokenPorExpirar,
} as const;
