import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNED_STRING_PREFIX = "hmacsha256=";

/**
 * Validación de webhook de LinkedIn (learn.microsoft.com/en-us/linkedin/
 * shared/api-guide/webhook-validation, verificado 2026-08-31): LinkedIn hace
 * `GET <webhookUrl>?challengeCode=<uuid>` y espera de vuelta
 * `{ challengeCode, challengeResponse }`, donde
 * `challengeResponse = HexEncode(HMACSHA256(challengeCode, clientSecret))`.
 *
 * A diferencia de `lib/firma-meta.ts` (que lee `env.META_APP_SECRET`
 * internamente porque esa variable es obligatoria y siempre está presente),
 * `clientSecret` se recibe como parámetro explícito acá: la integración de
 * LinkedIn es opcional en runtime (`config/env.ts`) y ambos servicios
 * LinkedIn ya existentes (`linkedin-subscription.service.ts`,
 * `linkedin-token.service.ts`) resuelven su configuración vía inyección de
 * dependencias, nunca leyendo `env` dentro del núcleo puro — mismo criterio
 * acá, para que este helper sea testeable con un secreto arbitrario sin
 * mockear `config/env.js`.
 */
export function computeLinkedInChallengeResponse(
  challengeCode: string,
  clientSecret: string,
): string {
  return createHmac("sha256", clientSecret).update(challengeCode).digest("hex");
}

/**
 * Verificación de `X-LI-Signature` (mismo doc, sección "Webhook payload
 * signature verification", verificado 2026-08-31):
 * `stringToSign = "hmacsha256=" + <cuerpo crudo exacto del POST>`,
 * `X-LI-Signature = HexEncode(HMACSHA256(stringToSign, clientSecret))`.
 *
 * Mismo criterio de seguridad que `lib/firma-meta.ts::verifyFirmaMeta`
 * (comparación en tiempo constante sobre `req.rawBody`, nunca sobre un
 * cuerpo re-serializado; cualquier entrada malformada o secreto ausente se
 * rechaza como firma inválida, nunca lanza) — algoritmo/header distintos
 * (`X-LI-Signature` en hex plano, sin prefijo `sha256=` en el header, a
 * diferencia de `X-Hub-Signature-256`), así que NO se reutiliza esa función.
 */
export function verifyFirmaLinkedIn(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  clientSecret: string | undefined,
): boolean {
  if (rawBody === undefined || signatureHeader === undefined || !clientSecret) return false;
  if (!/^[0-9a-fA-F]+$/.test(signatureHeader)) return false;

  const receivedSignature = Buffer.from(signatureHeader, "hex");
  const stringToSign = Buffer.concat([Buffer.from(SIGNED_STRING_PREFIX, "utf8"), rawBody]);
  const expectedSignature = createHmac("sha256", clientSecret).update(stringToSign).digest();

  if (receivedSignature.length !== expectedSignature.length) return false;
  return timingSafeEqual(receivedSignature, expectedSignature);
}
