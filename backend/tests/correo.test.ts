import { describe, expect, it } from "vitest";
import { normalizeCorreo } from "../src/lib/correo.js";

describe("lib/correo — normalizeCorreo", () => {
  it("recorta espacios y pasa a minúsculas solo para comparar; conserva el original", () => {
    const resultado = normalizeCorreo("  Juan.Perez@Correo.COM ");

    expect(resultado?.normalizado).toBe("juan.perez@correo.com");
    expect(resultado?.original).toBe("  Juan.Perez@Correo.COM ");
  });

  it("retorna null si el correo queda vacío tras recortar espacios", () => {
    expect(normalizeCorreo("   ")).toBeNull();
    expect(normalizeCorreo("")).toBeNull();
  });

  it("retorna null ante null o undefined", () => {
    expect(normalizeCorreo(null)).toBeNull();
    expect(normalizeCorreo(undefined)).toBeNull();
  });

  it("no valida formato — §8: no descarta un lead por un correo mal escrito", () => {
    const resultado = normalizeCorreo("no-es-un-correo-valido");

    expect(resultado?.normalizado).toBe("no-es-un-correo-valido");
  });
});
