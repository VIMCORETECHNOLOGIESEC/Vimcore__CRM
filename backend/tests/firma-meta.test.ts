import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { verifyFirmaMeta } from "../src/lib/firma-meta.js";

function firmar(cuerpo: Buffer, secreto: string = env.META_APP_SECRET): string {
  return `sha256=${createHmac("sha256", secreto).update(cuerpo).digest("hex")}`;
}

describe("lib/firma-meta — verifyFirmaMeta (M4, X-Hub-Signature-256)", () => {
  it("acepta una firma válida calculada sobre el cuerpo crudo exacto", () => {
    const cuerpo = Buffer.from(JSON.stringify({ object: "page", entry: [] }), "utf8");

    expect(verifyFirmaMeta(cuerpo, firmar(cuerpo))).toBe(true);
  });

  it("rechaza una firma calculada con un secreto distinto al configurado", () => {
    const cuerpo = Buffer.from(JSON.stringify({ object: "page", entry: [] }), "utf8");

    expect(verifyFirmaMeta(cuerpo, firmar(cuerpo, "otro-secreto-que-no-es-el-app-secret"))).toBe(
      false,
    );
  });

  it("rechaza cuando el cuerpo fue alterado después de calcular la firma (detecta tampering)", () => {
    const cuerpoOriginal = Buffer.from(JSON.stringify({ object: "page", entry: [] }), "utf8");
    const firma = firmar(cuerpoOriginal);
    const cuerpoAlterado = Buffer.from(
      JSON.stringify({ object: "page", entry: [], extra: true }),
      "utf8",
    );

    expect(verifyFirmaMeta(cuerpoAlterado, firma)).toBe(false);
  });

  it("rechaza cuando falta el encabezado de firma", () => {
    expect(verifyFirmaMeta(Buffer.from("{}", "utf8"), undefined)).toBe(false);
  });

  it("rechaza cuando falta el cuerpo crudo", () => {
    expect(verifyFirmaMeta(undefined, "sha256=deadbeef")).toBe(false);
  });

  it("rechaza un encabezado sin el prefijo sha256=", () => {
    const cuerpo = Buffer.from("{}", "utf8");
    const firmaSinPrefijo = createHmac("sha256", env.META_APP_SECRET).update(cuerpo).digest("hex");

    expect(verifyFirmaMeta(cuerpo, firmaSinPrefijo)).toBe(false);
  });

  it("rechaza un encabezado con hex inválido tras el prefijo", () => {
    expect(verifyFirmaMeta(Buffer.from("{}", "utf8"), "sha256=no-es-hex")).toBe(false);
  });
});
