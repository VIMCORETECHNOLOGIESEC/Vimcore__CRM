import { describe, expect, it } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import * as cuentaPublicitariaRepository from "../src/repositories/cuenta-publicitaria.repository.js";

let contador = 0;

async function crearBridge(): Promise<{ id: string }> {
  contador += 1;
  const bridge = await prisma.bridge.create({
    data: {
      redSocial: "FACEBOOK",
      nombre: `Bridge cuenta-publicitaria ${contador}`,
      claveApiHash: hashClaveBridge(`clave-cuenta-publicitaria-${contador}`),
      estado: "ACTIVO",
    },
  });
  return { id: bridge.id };
}

describe("repositories/cuenta-publicitaria — create (m4-bridges-crud-fundacion, PR1.8)", () => {
  it("crea la cuenta bajo el bridge, sin instagramAccountId vinculado", async () => {
    contador += 1;
    const bridge = await crearBridge();

    const cuenta = await cuentaPublicitariaRepository.create({
      bridgeId: bridge.id,
      idExterno: `page-create-${contador}`,
      nombre: "Página creada por repositorio",
    });

    expect(cuenta.bridgeId).toBe(bridge.id);
    expect(cuenta.idExterno).toBe(`page-create-${contador}`);
    expect(cuenta.idExternoVinculado).toBeNull();
    expect(cuenta.activa).toBe(true);
  });

  it("mantiene el nombre de campo Prisma idExternoVinculado — sin renombrar en esta capa (D-M4-fundacion)", async () => {
    contador += 1;
    const bridge = await crearBridge();

    const cuenta = await cuentaPublicitariaRepository.create({
      bridgeId: bridge.id,
      idExterno: `page-vinculada-${contador}`,
      nombre: "Página con Instagram",
      idExternoVinculado: `ig-${contador}`,
    });

    expect(cuenta.idExternoVinculado).toBe(`ig-${contador}`);
  });
});

describe("repositories/cuenta-publicitaria — listByBridge (m4-bridges-crud-fundacion, PR1.8)", () => {
  it("lista solo las cuentas del bridge indicado", async () => {
    const bridgeA = await crearBridge();
    const bridgeB = await crearBridge();
    contador += 1;
    await cuentaPublicitariaRepository.create({
      bridgeId: bridgeA.id,
      idExterno: `page-list-a-${contador}`,
      nombre: "Cuenta A",
    });
    contador += 1;
    await cuentaPublicitariaRepository.create({
      bridgeId: bridgeB.id,
      idExterno: `page-list-b-${contador}`,
      nombre: "Cuenta B",
    });

    const cuentasDeA = await cuentaPublicitariaRepository.listByBridge(bridgeA.id);

    expect(cuentasDeA).toHaveLength(1);
    expect(cuentasDeA[0]?.nombre).toBe("Cuenta A");
  });

  it("devuelve vacío cuando el bridge no tiene cuentas", async () => {
    const bridge = await crearBridge();

    const cuentas = await cuentaPublicitariaRepository.listByBridge(bridge.id);

    expect(cuentas).toEqual([]);
  });
});

describe("repositories/cuenta-publicitaria — updateActiva (m4-bridges-crud-fundacion, PR1.8)", () => {
  it("cambia únicamente el flag activa, sin tocar otras columnas", async () => {
    const bridge = await crearBridge();
    contador += 1;
    const cuenta = await cuentaPublicitariaRepository.create({
      bridgeId: bridge.id,
      idExterno: `page-toggle-${contador}`,
      nombre: "Cuenta a desactivar",
    });
    expect(cuenta.activa).toBe(true);

    const actualizada = await cuentaPublicitariaRepository.updateActiva(cuenta.id, false);

    expect(actualizada.activa).toBe(false);
    expect(actualizada.nombre).toBe("Cuenta a desactivar");
  });
});

describe("repositories/cuenta-publicitaria — findByBridgeEIdExterno (M-hardening Bloque A, WU4, D6)", () => {
  it("encuentra la cuenta por bridgeId + idExterno (mismo criterio que @@unique([bridgeId, idExterno]))", async () => {
    const bridge = await crearBridge();
    contador += 1;
    const creada = await cuentaPublicitariaRepository.create({
      bridgeId: bridge.id,
      idExterno: `page-lookup-${contador}`,
      nombre: "Cuenta encontrable por lookup",
    });

    const encontrada = await cuentaPublicitariaRepository.findByBridgeEIdExterno(
      bridge.id,
      `page-lookup-${contador}`,
    );

    expect(encontrada?.id).toBe(creada.id);
  });

  it("degrada a null cuando el idExterno no tiene match para ese bridge (sin lanzar)", async () => {
    const bridge = await crearBridge();

    const encontrada = await cuentaPublicitariaRepository.findByBridgeEIdExterno(
      bridge.id,
      "page-inexistente",
    );

    expect(encontrada).toBeNull();
  });
});
