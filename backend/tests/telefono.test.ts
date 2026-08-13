import { parsePhoneNumber } from "libphonenumber-js";
import { describe, expect, it } from "vitest";
import { normalizeTelefono } from "../src/lib/telefono.js";

describe("libphonenumber-js — guardia de superficie de API (D-M3)", () => {
  it("expone parsePhoneNumber como función no-throwing", () => {
    expect(typeof parsePhoneNumber).toBe("function");
  });

  it("un número EC válido hace round-trip a formato +593…", () => {
    const numero = parsePhoneNumber("0991234567", { defaultCountry: "EC" });

    expect(numero?.isValid()).toBe(true);
    expect(numero?.number).toBe("+593991234567");
  });
});

describe("lib/telefono — normalizeTelefono", () => {
  it.each([
    ["0991234567", "+593991234567", true],
    ["+593991234567", "+593991234567", true],
    ["+14155552671", "+14155552671", true],
    ["(099) 123-4567. ", "+593991234567", true],
    ["", null, false],
    [null, null, false],
    ["abc-not-a-phone", null, false],
  ] as const)(
    "normaliza %j -> {normalizado: %j, valido: %j}",
    (raw, normalizadoEsperado, validoEsperado) => {
      const resultado = normalizeTelefono(raw);

      expect(resultado.normalizado).toBe(normalizadoEsperado);
      expect(resultado.valido).toBe(validoEsperado);
    },
  );

  it("nunca lanza excepción, incluso ante entrada indefinida", () => {
    expect(() => normalizeTelefono(undefined)).not.toThrow();
  });

  it.each([
    ["099.123-4567", "+593991234567", true],
    ["0 99 123 4567", "+593991234567", true],
  ] as const)(
    "separadores mixtos %j -> {normalizado: %j, valido: %j}",
    (raw, normalizadoEsperado, validoEsperado) => {
      const resultado = normalizeTelefono(raw);

      expect(resultado.normalizado).toBe(normalizadoEsperado);
      expect(resultado.valido).toBe(validoEsperado);
    },
  );

  it("un número con solo ceros se marca inválido, no lanza", () => {
    const resultado = normalizeTelefono("00000000");

    expect(resultado.valido).toBe(false);
    expect(resultado.normalizado).toBeNull();
  });

  it("un número demasiado largo (TOO_LONG interno) se marca inválido, no lanza", () => {
    expect(() => normalizeTelefono("0999999999999999999")).not.toThrow();

    const resultado = normalizeTelefono("0999999999999999999");

    expect(resultado.valido).toBe(false);
    expect(resultado.normalizado).toBeNull();
  });
});
