import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Mismo patrón fail-fast que `cifrado-token.test.ts` (D-C): el proceso
 * aborta al arrancar si falta `META_WEBHOOK_VERIFY_TOKEN`/`META_APP_SECRET`,
 * en vez de arrancar con firmas/handshakes que nunca podrían validar nada.
 */
function correrSinVariable(nombreVariable: string): { status: number | null; stderr: string } {
  const fixture = path.join(__dirname, "fixtures", "cargar-env.ts");
  const envSinVariable = { ...process.env };
  delete envSinVariable[nombreVariable];

  const resultado = spawnSync(
    process.execPath,
    [path.join(__dirname, "..", "node_modules", "tsx", "dist", "cli.mjs"), fixture],
    { env: envSinVariable, encoding: "utf8" },
  );
  return { status: resultado.status, stderr: resultado.stderr };
}

describe("config/env — META_WEBHOOK_VERIFY_TOKEN/META_APP_SECRET/META_APP_ID obligatorias (adaptador Meta, mismo patrón que JWT_SECRET/TOKEN_ENCRYPTION_KEY)", () => {
  it("el proceso no arranca si falta META_WEBHOOK_VERIFY_TOKEN", () => {
    const resultado = correrSinVariable("META_WEBHOOK_VERIFY_TOKEN");

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain("META_WEBHOOK_VERIFY_TOKEN");
  });

  it("el proceso no arranca si falta META_APP_SECRET", () => {
    const resultado = correrSinVariable("META_APP_SECRET");

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain("META_APP_SECRET");
  });

  it("el proceso no arranca si falta META_APP_ID (endpoints de administración de token, docs/05-bridges.md §7)", () => {
    const resultado = correrSinVariable("META_APP_ID");

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain("META_APP_ID");
  });
});
