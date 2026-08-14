import { describe, expect, it } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import * as bridgeRepository from "../src/repositories/bridge.repository.js";

let contador = 0;

/** Clave de API única por prueba — evita colisión del índice UNIQUE. */
function claveApiUnica(): string {
  contador += 1;
  return `clave-api-prueba-${contador}`;
}

async function crearBridge(): Promise<{ id: string; claveApi: string }> {
  const claveApi = claveApiUnica();
  const bridge = await prisma.bridge.create({
    data: {
      redSocial: "GOOGLE_FORMS",
      nombre: `Bridge de prueba ${contador}`,
      claveApiHash: hashClaveBridge(claveApi),
      estado: "ACTIVO",
    },
  });

  return { id: bridge.id, claveApi };
}

describe("repositories/bridge — findByClaveApiHash (M4, PR1)", () => {
  it("encuentra el bridge cuyo hash de clave coincide exactamente", async () => {
    const { id, claveApi } = await crearBridge();

    const encontrado = await bridgeRepository.findByClaveApiHash(hashClaveBridge(claveApi));

    expect(encontrado?.id).toBe(id);
  });

  it("devuelve null cuando ningún bridge tiene ese hash de clave", async () => {
    const encontrado = await bridgeRepository.findByClaveApiHash(hashClaveBridge("clave-que-no-existe"));

    expect(encontrado).toBeNull();
  });
});

describe("repositories/bridge — touchUltimoLeadEn (M4, PR1)", () => {
  it("actualiza ultimoLeadEn a un timestamp reciente", async () => {
    const { id } = await crearBridge();
    const antes = await prisma.bridge.findUniqueOrThrow({ where: { id } });
    expect(antes.ultimoLeadEn).toBeNull();

    const momentoAntes = Date.now();
    await bridgeRepository.touchUltimoLeadEn(id);
    const despues = await prisma.bridge.findUniqueOrThrow({ where: { id } });

    expect(despues.ultimoLeadEn).not.toBeNull();
    expect(despues.ultimoLeadEn!.getTime()).toBeGreaterThanOrEqual(momentoAntes);
  });
});
