import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/password.js";

describe("lib/password", () => {
  it("produce un hash argon2id distinto de la contraseña en claro", async () => {
    const hash = await hashPassword("una-contrasena-larga");

    expect(hash).not.toBe("una-contrasena-larga");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verifica correctamente la contraseña que generó el hash", async () => {
    const hash = await hashPassword("clave-correcta-123");

    await expect(verifyPassword(hash, "clave-correcta-123")).resolves.toBe(true);
  });

  it("rechaza una contraseña incorrecta contra un hash válido", async () => {
    const hash = await hashPassword("clave-correcta-123");

    await expect(verifyPassword(hash, "clave-incorrecta")).resolves.toBe(false);
  });

  it("dos hashes de la misma contraseña son distintos (salt aleatorio)", async () => {
    const hashA = await hashPassword("misma-clave");
    const hashB = await hashPassword("misma-clave");

    expect(hashA).not.toBe(hashB);
  });
});
