import { afterAll, describe, expect, it } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import {
  createBridge,
  deleteBridge,
  getBridgeById,
  listBridges,
  regenerarClave,
  updateBridge,
} from "../src/services/bridge.service.js";

let contador = 0;

function claveApiUnica(): string {
  contador += 1;
  return `clave-api-service-${contador}`;
}

async function crearBridgeDirecto(
  overrides: Partial<{ estado: "ACTIVO" | "INACTIVO"; redSocial: "FACEBOOK" | "GOOGLE_FORMS" }> = {},
): Promise<{ id: string; claveApi: string }> {
  contador += 1;
  const claveApi = claveApiUnica();
  const bridge = await prisma.bridge.create({
    data: {
      redSocial: overrides.redSocial ?? "GOOGLE_FORMS",
      nombre: `Bridge servicio ${contador}`,
      claveApiHash: hashClaveBridge(claveApi),
      estado: overrides.estado ?? "ACTIVO",
    },
  });
  return { id: bridge.id, claveApi };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("bridge.service — createBridge (Requirement: Bridge creation starts inactive with one-time plaintext key)", () => {
  it("nace INACTIVO sin importar el redSocial y devuelve la clave en claro con el prefijo brg_", async () => {
    const { bridge, claveApi } = await createBridge({
      redSocial: "FACEBOOK",
      nombre: "Bridge Facebook Servicio",
    });

    expect(bridge.estado).toBe("INACTIVO");
    expect(claveApi.startsWith("brg_")).toBe(true);

    const filaPersistida = await prisma.bridge.findUniqueOrThrow({ where: { id: bridge.id } });
    expect(filaPersistida.claveApiHash).toBe(hashClaveBridge(claveApi));
  });

  it("la respuesta nunca incluye claveApiHash", async () => {
    const { bridge } = await createBridge({ redSocial: "X", nombre: "Bridge X Servicio" });

    expect(bridge).not.toHaveProperty("claveApiHash");
    expect(bridge.tokenExpiraEn).toBeNull();
  });
});

describe("bridge.service — listBridges/getBridgeById", () => {
  it("listBridges nunca expone claveApiHash", async () => {
    await crearBridgeDirecto();

    const bridges = await listBridges();

    expect(bridges.length).toBeGreaterThan(0);
    for (const bridge of bridges) {
      expect(bridge).not.toHaveProperty("claveApiHash");
    }
  });

  it("getBridgeById incluye cuentasPublicitarias embebidas", async () => {
    const { id } = await crearBridgeDirecto();

    const detalle = await getBridgeById(id);

    expect(detalle.id).toBe(id);
    expect(Array.isArray(detalle.cuentasPublicitarias)).toBe(true);
  });

  it("getBridgeById con un id inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      getBridgeById("00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("bridge.service — updateBridge (Requirement: PATCH /bridges/:id es el único endpoint)", () => {
  it("renombrar no cambia el estado", async () => {
    const { id } = await crearBridgeDirecto({ estado: "ACTIVO" });

    const actualizado = await updateBridge(id, { nombre: "Nombre Renombrado" });

    expect(actualizado.nombre).toBe("Nombre Renombrado");
    expect(actualizado.estado).toBe("ACTIVO");
  });

  it("cambia estado de ACTIVO a INACTIVO y viceversa por el mismo endpoint", async () => {
    const { id } = await crearBridgeDirecto({ estado: "ACTIVO" });

    const desactivado = await updateBridge(id, { estado: "INACTIVO" });
    expect(desactivado.estado).toBe("INACTIVO");

    const reactivado = await updateBridge(id, { estado: "ACTIVO" });
    expect(reactivado.estado).toBe("ACTIVO");
  });

  it("con un id inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      updateBridge("00000000-0000-0000-0000-000000000000", { nombre: "Fantasma" }),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("bridge.service — deleteBridge (Requirement: Delete mode is decided by lead count, never ultimoLeadEn)", () => {
  it("con leadsRecibidos.count === 0 hace BAJA_FISICA y elimina la fila", async () => {
    const { id } = await crearBridgeDirecto();

    const resultado = await deleteBridge(id);

    expect(resultado.resultado).toBe("BAJA_FISICA");
    const filaTrasBorrado = await prisma.bridge.findUnique({ where: { id } });
    expect(filaTrasBorrado).toBeNull();
  });

  it("con leadsRecibidos.count > 0 hace BAJA_LOGICA y la fila permanece INACTIVO", async () => {
    const { id } = await crearBridgeDirecto({ estado: "ACTIVO" });
    await prisma.leadRecibido.create({
      data: {
        bridgeId: id,
        idExternoLead: `lead-externo-${contador}`,
        payload: {},
        entradaProcesamiento: {},
      },
    });

    const resultado = await deleteBridge(id);

    expect(resultado.resultado).toBe("BAJA_LOGICA");
    const filaTrasBaja = await prisma.bridge.findUniqueOrThrow({ where: { id } });
    expect(filaTrasBaja.estado).toBe("INACTIVO");
  });

  it("con un id inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      deleteBridge("00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("bridge.service — regenerarClave (Requirement: Key regeneration never changes bridge state)", () => {
  it("emite una clave nueva distinta de la original y deja estado ACTIVO intacto", async () => {
    const { id, claveApi: claveOriginal } = await crearBridgeDirecto({ estado: "ACTIVO" });

    const { bridge, claveApi: claveNueva } = await regenerarClave(id);

    expect(claveNueva).not.toBe(claveOriginal);
    expect(bridge.estado).toBe("ACTIVO");
  });

  it("deja estado INACTIVO intacto", async () => {
    const { id } = await crearBridgeDirecto({ estado: "INACTIVO" });

    const { bridge } = await regenerarClave(id);

    expect(bridge.estado).toBe("INACTIVO");
  });

  it("con un id inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      regenerarClave("00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});
