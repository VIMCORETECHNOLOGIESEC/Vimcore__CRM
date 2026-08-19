import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../src/lib/cifrado-token.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("lib/cifrado-token — encrypt/decrypt (M4, AES-256-GCM)", () => {
  it("cifra y descifra de ida y vuelta, devolviendo el texto original exacto", () => {
    const original = "EAAG_pagina_access_token_de_prueba_no_real";

    const cifrado = encrypt(original);

    expect(cifrado).not.toBe(original);
    expect(decrypt(cifrado)).toBe(original);
  });

  it("dos cifrados del mismo texto en claro producen ciphertexts distintos (IV aleatorio)", () => {
    const original = "mismo-token-en-claro";

    const cifradoA = encrypt(original);
    const cifradoB = encrypt(original);

    expect(cifradoA).not.toBe(cifradoB);
    // Ambos siguen descifrando al mismo texto — la diferencia es solo el IV.
    expect(decrypt(cifradoA)).toBe(original);
    expect(decrypt(cifradoB)).toBe(original);
  });

  it("un ciphertext con el auth tag alterado se rechaza al descifrar, no devuelve texto corrupto", () => {
    const cifrado = encrypt("token-secreto");
    const [iv, tag, datos] = cifrado.split(":");
    // Tampering del tag: invierte el primer byte hex.
    const tagAlterado = (tag[0] === "0" ? "1" : "0") + tag.slice(1);
    const cifradoAlterado = [iv, tagAlterado, datos].join(":");

    expect(() => decrypt(cifradoAlterado)).toThrow();
  });

  it("un ciphertext con los datos alterados se rechaza al descifrar, no devuelve texto corrupto", () => {
    const cifrado = encrypt("token-secreto");
    const [iv, tag, datos] = cifrado.split(":");
    const datosAlterados = (datos[0] === "0" ? "1" : "0") + datos.slice(1);
    const cifradoAlterado = [iv, tag, datosAlterados].join(":");

    expect(() => decrypt(cifradoAlterado)).toThrow();
  });

  it("un string con formato inválido (sin las 3 partes) se rechaza sin intentar descifrar", () => {
    expect(() => decrypt("no-tiene-el-formato-esperado")).toThrow();
  });
});

describe("config/env — TOKEN_ENCRYPTION_KEY obligatoria (D-C, mismo patrón que JWT_SECRET)", () => {
  it("el proceso no arranca si falta TOKEN_ENCRYPTION_KEY", () => {
    const fixture = path.join(__dirname, "fixtures", "cargar-env.ts");
    const envSinClave = { ...process.env };
    delete envSinClave.TOKEN_ENCRYPTION_KEY;

    const resultado = spawnSync(
      process.execPath,
      [path.join(__dirname, "..", "node_modules", "tsx", "dist", "cli.mjs"), fixture],
      { env: envSinClave, encoding: "utf8" },
    );

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain("TOKEN_ENCRYPTION_KEY");
  });
});
