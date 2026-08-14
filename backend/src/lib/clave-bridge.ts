import { createHash, timingSafeEqual } from "node:crypto";

/**
 * D-M4 (diseño, DD4): hash sha256hex irreversible de la clave de API de un
 * bridge (`X-Bridge-Key`, docs/05-bridges.md §5/§7). Mismo mecanismo que
 * `hashRefreshToken` en `auth.service.ts`, generalizado a `lib/` porque lo
 * usan tanto el repositorio de bridges como el middleware de autenticación
 * (PR3b). La clave en claro nunca se persiste ni se puede recuperar del hash.
 */
export function hashClaveBridge(claveApi: string): string {
  return createHash("sha256").update(claveApi).digest("hex");
}

/**
 * D-M4 (diseño, DD4): comparación en tiempo constante entre dos hashes
 * sha256hex, para no filtrar por temporización cuánto de la clave presentada
 * coincide con la almacenada. A diferencia del `!==` de `auth.service.ts`
 * (defensa en profundidad sobre una firma JWT ya verificada), aquí el hash
 * de la clave de API es el único control de autenticación del bridge, así
 * que exige la barra más alta de `timingSafeEqual`.
 */
export function compareClaveBridge(hashA: string, hashB: string): boolean {
  const bufferA = Buffer.from(hashA, "hex");
  const bufferB = Buffer.from(hashB, "hex");

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}
