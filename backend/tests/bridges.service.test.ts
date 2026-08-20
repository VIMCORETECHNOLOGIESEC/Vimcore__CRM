import { RedSocial } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import * as bridgeLogRepository from "../src/repositories/bridge-log.repository.js";
import { prisma } from "../src/lib/prisma.js";
import {
  createBridge,
  deleteBridge,
  findBridges,
  getBridgeById,
  listLogs,
  listRedesActivas,
  listRedesSoportadas,
  regenerateClave,
  resolveLimiteLogs,
  updateBridge,
} from "../src/services/bridge.service.js";
import {
  create as crearCuentaPublicitaria,
  listByBridge as listarCuentasPorBridge,
  toggleActiva,
} from "../src/services/cuenta-publicitaria.service.js";

let contador = 0;

function claveApiUnica(): string {
  contador += 1;
  return `clave-api-service-${contador}`;
}

async function crearBridgeDirecto(
  overrides: Partial<{ estado: "ACTIVO" | "INACTIVO"; redSocial: RedSocial }> = {},
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

describe("bridge.service — findBridges/getBridgeById", () => {
  it("findBridges nunca expone claveApiHash y devuelve total/pagina/limite", async () => {
    await crearBridgeDirecto();

    const resultado = await findBridges({ pagina: 1, limite: 20 });

    expect(resultado.bridges.length).toBeGreaterThan(0);
    expect(typeof resultado.total).toBe("number");
    expect(resultado.pagina).toBe(1);
    expect(resultado.limite).toBe(20);
    for (const bridge of resultado.bridges) {
      expect(bridge).not.toHaveProperty("claveApiHash");
    }
  });

  it("findBridges filtra por busqueda contra el nombre (insensible a mayúsculas)", async () => {
    const { id } = await crearBridgeDirecto();
    const nombreUnico = (await prisma.bridge.findUniqueOrThrow({ where: { id } })).nombre;

    const resultado = await findBridges({
      pagina: 1,
      limite: 20,
      busqueda: nombreUnico.toUpperCase(),
    });

    expect(resultado.bridges.map((b) => b.id)).toContain(id);
  });

  it("findBridges filtra por redSocial exacto", async () => {
    const { id } = await crearBridgeDirecto({ redSocial: "FACEBOOK" });

    const resultado = await findBridges({ pagina: 1, limite: 100, redSocial: "FACEBOOK" });

    expect(resultado.bridges.map((b) => b.id)).toContain(id);
    for (const bridge of resultado.bridges) {
      expect(bridge.redSocial).toBe("FACEBOOK");
    }
  });

  it("findBridges filtra por estado exacto", async () => {
    const { id } = await crearBridgeDirecto({ estado: "INACTIVO" });

    const resultado = await findBridges({ pagina: 1, limite: 100, estado: "INACTIVO" });

    expect(resultado.bridges.map((b) => b.id)).toContain(id);
    for (const bridge of resultado.bridges) {
      expect(bridge.estado).toBe("INACTIVO");
    }
  });

  it("findBridges pagina respetando limite", async () => {
    await crearBridgeDirecto();
    await crearBridgeDirecto();

    const primeraPagina = await findBridges({ pagina: 1, limite: 1 });
    expect(primeraPagina.bridges).toHaveLength(1);
    expect(primeraPagina.total).toBeGreaterThanOrEqual(2);

    const segundaPagina = await findBridges({ pagina: 2, limite: 1 });
    expect(segundaPagina.bridges).toHaveLength(1);
    expect(segundaPagina.bridges[0]?.id).not.toBe(primeraPagina.bridges[0]?.id);
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

describe("bridge.service — regenerateClave (Requirement: Key regeneration never changes bridge state)", () => {
  it("emite una clave nueva distinta de la original y deja estado ACTIVO intacto", async () => {
    const { id, claveApi: claveOriginal } = await crearBridgeDirecto({ estado: "ACTIVO" });

    const { bridge, claveApi: claveNueva } = await regenerateClave(id);

    expect(claveNueva).not.toBe(claveOriginal);
    expect(bridge.estado).toBe("ACTIVO");
  });

  it("deja estado INACTIVO intacto", async () => {
    const { id } = await crearBridgeDirecto({ estado: "INACTIVO" });

    const { bridge } = await regenerateClave(id);

    expect(bridge.estado).toBe("INACTIVO");
  });

  it("con un id inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      regenerateClave("00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("bridge.service — listRedesSoportadas (Requirement: Network catalogs are enum-derived and deduplicated)", () => {
  it("devuelve solo las redes con integración de ingesta real (FACEBOOK y GOOGLE_FORMS)", () => {
    const redes = listRedesSoportadas();

    expect(new Set(redes)).toEqual(new Set<RedSocial>(["FACEBOOK", "GOOGLE_FORMS"]));
  });

  it("excluye INSTAGRAM, X y LINKEDIN aunque formen parte del enum RedSocial", () => {
    const redes = listRedesSoportadas();

    expect(redes).not.toContain("INSTAGRAM" satisfies RedSocial);
    expect(redes).not.toContain("X" satisfies RedSocial);
    expect(redes).not.toContain("LINKEDIN" satisfies RedSocial);
  });
});

describe("bridge.service — listRedesActivas (Requirement: Network catalogs are enum-derived and deduplicated)", () => {
  it("no duplica una red social compartida por dos bridges no eliminados", async () => {
    await crearBridgeDirecto({ redSocial: "X" });
    await crearBridgeDirecto({ redSocial: "X" });

    const redes = await listRedesActivas();

    expect(redes.filter((r) => r === "X")).toHaveLength(1);
  });
});

describe("bridge.service — resolveLimiteLogs (Requirement: Log reads are bounded by a server-side default cap)", () => {
  it("sin argumento devuelve el default 100", () => {
    expect(resolveLimiteLogs(undefined)).toBe(100);
  });

  it("recorta un valor mayor a 500 al cap duro", () => {
    expect(resolveLimiteLogs(10_000)).toBe(500);
  });

  it("respeta un valor válido dentro del rango", () => {
    expect(resolveLimiteLogs(10)).toBe(10);
  });
});

describe("bridge.service — listLogs (Requirement: Log reads are bounded by a server-side default cap)", () => {
  it("filtra por bridge y nivel, respetando el límite resuelto", async () => {
    const { id } = await crearBridgeDirecto();
    await bridgeLogRepository.registrarLog({ bridgeId: id, nivel: "INFO", mensaje: "info listarLogs" });
    await bridgeLogRepository.registrarLog({ bridgeId: id, nivel: "ERROR", mensaje: "error listarLogs" });

    const logs = await listLogs(id, { nivel: "ERROR" });

    expect(logs).toHaveLength(1);
    expect(logs[0]?.nivel).toBe("ERROR");
  });

  it("con un bridge inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      listLogs("00000000-0000-0000-0000-000000000000", {}),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("cuenta-publicitaria.service — create (Requirement: Admin can manually create a CuentaPublicitaria)", () => {
  it("crea la cuenta bajo el bridge indicado con instagramAccountId sin validar (texto libre)", async () => {
    const { id: bridgeId } = await crearBridgeDirecto({ redSocial: "FACEBOOK" });

    const cuenta = await crearCuentaPublicitaria(bridgeId, {
      idExterno: "page-123",
      nombre: "Cuenta Meta",
      instagramAccountId: "ig-cualquier-cosa-no-validada",
    });

    expect(cuenta.bridgeId).toBe(bridgeId);
    expect(cuenta.instagramAccountId).toBe("ig-cualquier-cosa-no-validada");

    const filaPersistida = await prisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuenta.id } });
    expect(filaPersistida.idExternoVinculado).toBe("ig-cualquier-cosa-no-validada");
  });

  it("instagramAccountId es opcional y persiste null cuando se omite", async () => {
    const { id: bridgeId } = await crearBridgeDirecto({ redSocial: "GOOGLE_FORMS" });

    const cuenta = await crearCuentaPublicitaria(bridgeId, { idExterno: "form-1", nombre: "Cuenta Forms" });

    expect(cuenta.instagramAccountId).toBeNull();
  });

  it("con un bridge inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      crearCuentaPublicitaria("00000000-0000-0000-0000-000000000000", { idExterno: "x", nombre: "y" }),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("cuenta-publicitaria.service — listByBridge", () => {
  it("mapea instagramAccountId y nunca expone idExternoVinculado", async () => {
    const { id: bridgeId } = await crearBridgeDirecto({ redSocial: "FACEBOOK" });
    await crearCuentaPublicitaria(bridgeId, {
      idExterno: "page-list-1",
      nombre: "Cuenta Lista",
      instagramAccountId: "ig-list-1",
    });

    const cuentas = await listarCuentasPorBridge(bridgeId);

    expect(cuentas).toHaveLength(1);
    expect(cuentas[0]?.instagramAccountId).toBe("ig-list-1");
    expect(cuentas[0]).not.toHaveProperty("idExternoVinculado");
  });

  it("con un bridge inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      listarCuentasPorBridge("00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("cuenta-publicitaria.service — toggleActiva (Requirement: Bridge detail embeds its accounts; PATCH toggles only activation)", () => {
  it("cambia solo activa, dejando idExterno/nombre intactos", async () => {
    const { id: bridgeId } = await crearBridgeDirecto({ redSocial: "LINKEDIN" });
    const cuenta = await crearCuentaPublicitaria(bridgeId, { idExterno: "page-toggle", nombre: "Cuenta Toggle" });

    const actualizada = await toggleActiva(bridgeId, cuenta.id, false);

    expect(actualizada.activa).toBe(false);
    expect(actualizada.idExterno).toBe("page-toggle");
    expect(actualizada.nombre).toBe("Cuenta Toggle");
  });

  it("con una cuenta que no pertenece al bridge lanza cuenta_no_encontrada (404)", async () => {
    const { id: bridgeA } = await crearBridgeDirecto({ redSocial: "LINKEDIN" });
    const { id: bridgeB } = await crearBridgeDirecto({ redSocial: "LINKEDIN" });
    const cuentaDeA = await crearCuentaPublicitaria(bridgeA, { idExterno: "page-cross", nombre: "Cuenta Cruzada" });

    await expect(toggleActiva(bridgeB, cuentaDeA.id, false)).rejects.toMatchObject({
      code: "cuenta_publicitaria_no_encontrada",
      statusHttp: 404,
    });
  });

  it("con un bridge inexistente lanza bridge_no_encontrado (404)", async () => {
    await expect(
      toggleActiva("00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000001", false),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
  });
});

describe("bridge.service — getBridgeById embeds cuentasPublicitarias mapped to instagramAccountId (Requirement: Bridge detail embeds its accounts)", () => {
  it("nunca expone idExternoVinculado en las cuentas embebidas", async () => {
    const { id: bridgeId } = await crearBridgeDirecto({ redSocial: "INSTAGRAM" });
    await crearCuentaPublicitaria(bridgeId, {
      idExterno: "page-embed",
      nombre: "Cuenta Embebida",
      instagramAccountId: "ig-embed",
    });

    const detalle = await getBridgeById(bridgeId);

    expect(detalle.cuentasPublicitarias).toHaveLength(1);
    expect(detalle.cuentasPublicitarias[0]?.instagramAccountId).toBe("ig-embed");
    expect(detalle.cuentasPublicitarias[0]).not.toHaveProperty("idExternoVinculado");
  });
});
