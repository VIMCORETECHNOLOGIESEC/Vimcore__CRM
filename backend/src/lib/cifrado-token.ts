import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // 96 bits — tamaño recomendado por NIST para GCM.
const TAG_LENGTH_BYTES = 16;
const SEPARATOR = ":";

/**
 * AGENTS.md §6 / decisión 2026-08-18 (docs/03-modelo-datos.md
 * §cuentas_publicitarias): tokens de redes sociales (Page Access Token de
 * Meta, y en el futuro LinkedIn) se cifran en reposo con AES-256-GCM antes de
 * persistirse en `cuentas_publicitarias.token_cifrado` — nunca en claro, y
 * nunca salen por la API ni siquiera parcialmente.
 *
 * `TOKEN_ENCRYPTION_KEY` (64 caracteres hex = 32 bytes) es la clave maestra,
 * validada al arranque en `config/env.ts` — el proceso no inicia sin ella
 * (mismo patrón que `JWT_SECRET`).
 */
function getMasterKey(): Buffer {
  return Buffer.from(env.TOKEN_ENCRYPTION_KEY, "hex");
}

/**
 * Cifra `plainText` con AES-256-GCM y un IV aleatorio de 96 bits en cada
 * llamada (nunca determinístico — dos cifrados del mismo texto producen
 * ciphertexts distintos). El resultado serializa IV, auth tag y ciphertext
 * (todos hex) en un único string `"iv:tag:ciphertext"`, para viajar entero
 * en una sola columna `text`.
 */
export function encrypt(plainText: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, getMasterKey(), iv);

  const cipherText = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString("hex"), tag.toString("hex"), cipherText.toString("hex")].join(SEPARATOR);
}

/**
 * Descifra un string producido por `encrypt`. GCM verifica el auth tag antes
 * de devolver cualquier byte de texto plano: un ciphertext alterado (tag o
 * datos, incluido un simple bit-flip) lanza en `decipher.final()` en lugar de
 * devolver basura en silencio — nunca hay un "descifrado corrupto" exitoso.
 */
export function decrypt(cipherText: string): string {
  const parts = cipherText.split(SEPARATOR);
  if (parts.length !== 3) {
    throw new Error("Formato de texto cifrado inválido");
  }
  const [ivHex, tagHex, cipherTextHex] = parts;

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const cipherTextBytes = Buffer.from(cipherTextHex, "hex");

  if (iv.length !== IV_LENGTH_BYTES || tag.length !== TAG_LENGTH_BYTES) {
    throw new Error("Formato de texto cifrado inválido");
  }

  const decipher = createDecipheriv(ALGORITHM, getMasterKey(), iv);
  decipher.setAuthTag(tag);

  // Si el ciphertext o el tag fueron alterados, esta línea lanza
  // (autenticación GCM fallida) en vez de devolver texto plano corrupto.
  return Buffer.concat([decipher.update(cipherTextBytes), decipher.final()]).toString("utf8");
}
