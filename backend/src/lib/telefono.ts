import { parsePhoneNumber } from "libphonenumber-js";

/**
 * §1.1 (docs/02-reglas-negocio.md): país por defecto Ecuador (+593), sin
 * prefijo internacional. Unión discriminada — la rama `valido: true`
 * garantiza `normalizado: string` a nivel de tipos.
 */
export type TelefonoNormalizado =
  | { valido: true; original: string; normalizado: string }
  | { valido: false; original: string | null; normalizado: null };

/**
 * Normaliza un teléfono crudo a E.164. Pura, sin dependencias de Prisma,
 * nunca lanza excepción — "nunca lanza" es una garantía que sostenemos en
 * nuestra frontera, no que delegamos en `libphonenumber-js` (ver diseño).
 */
export function normalizeTelefono(
  raw: string | null | undefined,
): TelefonoNormalizado {
  if (raw === null || raw === undefined) {
    return { valido: false, original: raw ?? null, normalizado: null };
  }

  // Limpieza defensiva antes del parser: espacios, paréntesis, puntos y
  // guiones no forman parte de E.164.
  const limpio = raw.replace(/[\s().\-]/g, "");

  if (limpio.length === 0) {
    return { valido: false, original: raw, normalizado: null };
  }

  try {
    const numero = parsePhoneNumber(limpio, { defaultCountry: "EC" });

    if (numero.isValid()) {
      return { valido: true, original: raw, normalizado: numero.number };
    }

    return { valido: false, original: raw, normalizado: null };
  } catch {
    return { valido: false, original: raw, normalizado: null };
  }
}
