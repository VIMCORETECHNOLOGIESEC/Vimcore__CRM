import { describe, expect, it } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import * as campaniaRepository from "../src/repositories/campania.repository.js";
import * as cuentaPublicitariaRepository from "../src/repositories/cuenta-publicitaria.repository.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

let contador = 0;

async function crearCuenta(): Promise<{ id: string }> {
  contador += 1;
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      redSocial: "FACEBOOK",
      nombre: `Bridge campania ${contador}`,
      claveApiHash: hashClaveBridge(`clave-campania-${contador}`),
      estado: "ACTIVO",
      empresaId: EMPRESA_BOOTSTRAP_ID,
    },
  });
  const cuenta = await cuentaPublicitariaRepository.create({
    bridgeId: bridge.id,
    idExterno: `page-campania-${contador}`,
    nombre: "Cuenta para campañas",
  });
  return { id: cuenta.id };
}

describe("repositories/campania — findByCuentaEIdExterno (M-hardening Bloque A, WU4, D6)", () => {
  it("encuentra la campaña por cuentaPublicitariaId + idExterno (mismo criterio que @@unique)", async () => {
    const cuenta = await crearCuenta();
    contador += 1;
    const creada = await prisma.campania.create({
      data: {
        cuentaPublicitariaId: cuenta.id,
        idExterno: `camp-lookup-${contador}`,
        nombre: "Campaña encontrable",
        redSocial: "FACEBOOK",
      },
    });

    const encontrada = await campaniaRepository.findByCuentaEIdExterno(
      cuenta.id,
      `camp-lookup-${contador}`,
    );

    expect(encontrada?.id).toBe(creada.id);
  });

  it("degrada a null cuando el idExterno no tiene match para esa cuenta (sin lanzar)", async () => {
    const cuenta = await crearCuenta();

    const encontrada = await campaniaRepository.findByCuentaEIdExterno(
      cuenta.id,
      "camp-inexistente",
    );

    expect(encontrada).toBeNull();
  });
});
