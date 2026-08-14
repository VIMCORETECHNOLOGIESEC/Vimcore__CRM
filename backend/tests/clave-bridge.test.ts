import { describe, expect, it, vi } from "vitest";
import { compareClaveBridge, hashClaveBridge } from "../src/lib/clave-bridge.js";

const { timingSafeEqualMock } = vi.hoisted(() => ({ timingSafeEqualMock: vi.fn() }));

// D-M4 (diseño, tarea PR1.7): interceptamos `timingSafeEqual` sin perder su
// comportamiento real, para probar que `compareClaveBridge` delega en él —
// una propiedad de mecanismo que un simple `expect(resultado).toBe(true)`
// no distingue de un `===` que produce el mismo resultado por casualidad.
// `vi.mock` se hoistea sobre los imports estáticos de arriba, así que
// `clave-bridge.ts` recibe esta versión interceptada de `node:crypto`.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    timingSafeEqual: (...args: Parameters<typeof actual.timingSafeEqual>) => {
      timingSafeEqualMock(...args);
      return actual.timingSafeEqual(...args);
    },
  };
});

describe("lib/clave-bridge — hashClaveBridge (M4, PR1)", () => {
  it("produce un hash sha256hex de longitud fija que no contiene la clave original", () => {
    const claveApi = "clave-secreta-de-bridge-12345";
    const hash = hashClaveBridge(claveApi);

    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    expect(hash).not.toContain(claveApi);
    expect(hash.includes(Buffer.from(claveApi).toString("hex"))).toBe(false);
  });

  it("un cambio mínimo en la clave produce un hash con mayoría de caracteres distintos (efecto avalancha, no codificación reversible)", () => {
    const hashA = hashClaveBridge("clave-secreta-de-bridge-12345");
    const hashB = hashClaveBridge("clave-secreta-de-bridge-12346");

    let coincidencias = 0;
    for (let i = 0; i < hashA.length; i += 1) {
      if (hashA[i] === hashB[i]) {
        coincidencias += 1;
      }
    }

    expect(coincidencias).toBeLessThan(hashA.length / 2);
  });

  it("la misma clave produce siempre el mismo hash (determinístico, para comparar contra lo almacenado)", () => {
    const claveApi = "clave-secreta-de-bridge-12345";

    expect(hashClaveBridge(claveApi)).toBe(hashClaveBridge(claveApi));
  });
});

describe("lib/clave-bridge — compareClaveBridge (M4, PR1)", () => {
  it("hashes iguales: delega la comparación en timingSafeEqual y devuelve true", () => {
    const hash = hashClaveBridge("clave-secreta-de-bridge-12345");

    const resultado = compareClaveBridge(hash, hash);

    expect(resultado).toBe(true);
    expect(timingSafeEqualMock).toHaveBeenCalledTimes(1);
  });

  it("hashes distintos de igual longitud: sigue usando timingSafeEqual y devuelve false", () => {
    timingSafeEqualMock.mockClear();
    const hashA = hashClaveBridge("clave-secreta-de-bridge-12345");
    const hashB = hashClaveBridge("otra-clave-de-api-completamente-distinta");

    const resultado = compareClaveBridge(hashA, hashB);

    expect(resultado).toBe(false);
    expect(timingSafeEqualMock).toHaveBeenCalledTimes(1);
  });

  it("hashes de longitud distinta: se rechazan sin invocar timingSafeEqual (evita su excepción por longitudes desiguales)", () => {
    timingSafeEqualMock.mockClear();

    const resultado = compareClaveBridge("ab", "abcd");

    expect(resultado).toBe(false);
    expect(timingSafeEqualMock).not.toHaveBeenCalled();
  });
});
