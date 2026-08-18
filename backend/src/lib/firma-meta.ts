import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

const SIGNATURE_PREFIX = "sha256=";

/**
 * Verificación de `X-Hub-Signature-256` (docs/05-bridges.md §3, §8):
 * HMAC-SHA256 con `META_APP_SECRET` sobre el CUERPO CRUDO exacto de la
 * request (`req.rawBody`, ver `app.ts`) — nunca sobre
 * `JSON.stringify(req.body)` re-serializado, porque el orden de claves o el
 * espaciado del JSON que Meta realmente envió puede no coincidir byte a
 * byte con una re-serialización, lo que rompería la verificación real aunque
 * "funcione" contra fixtures armados a mano.
 *
 * Comparación en tiempo constante (`timingSafeEqual`) para no filtrar el
 * secreto por temporización, mismo criterio que `clave-bridge.ts`. Cualquier
 * entrada malformada (sin prefijo `sha256=`, hex inválido, longitud
 * incorrecta, cuerpo ausente) se rechaza como firma inválida, nunca lanza.
 */
export function verifyFirmaMeta(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
): boolean {
  if (rawBody === undefined || signatureHeader === undefined) return false;
  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) return false;

  const receivedSignatureHex = signatureHeader.slice(SIGNATURE_PREFIX.length);
  if (!/^[0-9a-fA-F]+$/.test(receivedSignatureHex)) return false;

  const receivedSignature = Buffer.from(receivedSignatureHex, "hex");
  const expectedSignature = createHmac("sha256", env.META_APP_SECRET).update(rawBody).digest();

  if (receivedSignature.length !== expectedSignature.length) return false;
  return timingSafeEqual(receivedSignature, expectedSignature);
}
