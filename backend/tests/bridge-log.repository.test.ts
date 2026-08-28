import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import * as bridgeLogRepository from "../src/repositories/bridge-log.repository.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

describe("repositories/bridge-log — registrarLog (M4, PR2)", () => {
  it("escribe una fila de bitacora contra el cliente global, sin bridge asociado (fallo de autenticacion)", async () => {
    await bridgeLogRepository.registrarLog({
      bridgeId: null,
      nivel: "ERROR",
      mensaje: "X-Bridge-Key ausente o invalida",
      payload: { headers: { "x-bridge-key": null } },
    });

    const fila = await prisma.bridgeLog.findFirst({
      where: { bridgeId: null, mensaje: "X-Bridge-Key ausente o invalida" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(fila).not.toBeNull();
    expect(fila?.nivel).toBe("ERROR");
    expect(fila?.payload).toMatchObject({ headers: { "x-bridge-key": null } });
  });

  it("persiste sin payload cuando no se provee ninguno", async () => {
    await bridgeLogRepository.registrarLog({ bridgeId: null, nivel: "INFO", mensaje: "sin payload" });

    const fila = await prisma.bridgeLog.findFirst({
      where: { bridgeId: null, mensaje: "sin payload" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(fila?.payload).toBeNull();
  });

  it(
    "DD5 (diseño M4): pasar un cliente de transaccion a registrarLog es un error de tipos, " +
      "no una convencion — prueba de compilacion, sin aserciones en tiempo de ejecucion",
    async () => {
      await prisma.$transaction(async (tx) => {
        // @ts-expect-error — DD5: registrarLog nunca acepta un segundo
        // argumento de cliente/transaccion; siempre ata al `prisma` global.
        await bridgeLogRepository.registrarLog(
          { bridgeId: null, nivel: "INFO", mensaje: "no deberia compilar" },
          tx,
        );
      });
    },
  );
});

describe("repositories/bridge-log — listByBridge (m4-bridges-crud-fundacion, PR1.9)", () => {
  async function crearBridge(): Promise<{ id: string }> {
    const { hashClaveBridge } = await import("../src/lib/clave-bridge.js");
    const bridge = await testAdminPrisma.bridge.create({
      data: {
        redSocial: "GOOGLE_FORMS",
        nombre: `Bridge log listByBridge ${Date.now()}-${Math.random()}`,
        claveApiHash: hashClaveBridge(`clave-listbybridge-${Date.now()}-${Math.random()}`),
        estado: "ACTIVO",
        empresaId: EMPRESA_BOOTSTRAP_ID,
      },
    });
    return { id: bridge.id };
  }

  it("devuelve solo los logs del bridge indicado, más reciente primero", async () => {
    const bridge = await crearBridge();
    const otroBridge = await crearBridge();
    await bridgeLogRepository.registrarLog(
      { bridgeId: bridge.id, empresaId: EMPRESA_BOOTSTRAP_ID, nivel: "INFO", mensaje: "primero" },
      testAdminPrisma,
    );
    await bridgeLogRepository.registrarLog(
      { bridgeId: bridge.id, empresaId: EMPRESA_BOOTSTRAP_ID, nivel: "ERROR", mensaje: "segundo" },
      testAdminPrisma,
    );
    await bridgeLogRepository.registrarLog(
      { bridgeId: otroBridge.id, empresaId: EMPRESA_BOOTSTRAP_ID, nivel: "INFO", mensaje: "de otro bridge" },
      testAdminPrisma,
    );

    const logs = await bridgeLogRepository.listByBridge({ bridgeId: bridge.id }, 100, testAdminPrisma);

    expect(logs).toHaveLength(2);
    expect(logs[0]?.mensaje).toBe("segundo");
    expect(logs[1]?.mensaje).toBe("primero");
  });

  it("filtra por nivel cuando se provee", async () => {
    const bridge = await crearBridge();
    await bridgeLogRepository.registrarLog(
      { bridgeId: bridge.id, empresaId: EMPRESA_BOOTSTRAP_ID, nivel: "INFO", mensaje: "info" },
      testAdminPrisma,
    );
    await bridgeLogRepository.registrarLog(
      { bridgeId: bridge.id, empresaId: EMPRESA_BOOTSTRAP_ID, nivel: "ERROR", mensaje: "error" },
      testAdminPrisma,
    );

    const logs = await bridgeLogRepository.listByBridge(
      { bridgeId: bridge.id, nivel: "ERROR" },
      100,
      testAdminPrisma,
    );

    expect(logs).toHaveLength(1);
    expect(logs[0]?.nivel).toBe("ERROR");
  });

  it("respeta el límite indicado (cap del caller)", async () => {
    const bridge = await crearBridge();
    await bridgeLogRepository.registrarLog(
      { bridgeId: bridge.id, empresaId: EMPRESA_BOOTSTRAP_ID, nivel: "INFO", mensaje: "uno" },
      testAdminPrisma,
    );
    await bridgeLogRepository.registrarLog(
      { bridgeId: bridge.id, empresaId: EMPRESA_BOOTSTRAP_ID, nivel: "INFO", mensaje: "dos" },
      testAdminPrisma,
    );
    await bridgeLogRepository.registrarLog(
      { bridgeId: bridge.id, empresaId: EMPRESA_BOOTSTRAP_ID, nivel: "INFO", mensaje: "tres" },
      testAdminPrisma,
    );

    const logs = await bridgeLogRepository.listByBridge({ bridgeId: bridge.id }, 2, testAdminPrisma);

    expect(logs).toHaveLength(2);
  });

  it("filtra por rango de fechas (fechaDesde/fechaHasta) cuando se provee", async () => {
    const bridge = await crearBridge();
    await bridgeLogRepository.registrarLog(
      { bridgeId: bridge.id, empresaId: EMPRESA_BOOTSTRAP_ID, nivel: "INFO", mensaje: "dentro de rango" },
      testAdminPrisma,
    );

    const futuro = new Date(Date.now() + 60_000);
    const dentroDeRango = new Date(Date.now() - 60_000);

    const logsFuera = await bridgeLogRepository.listByBridge(
      { bridgeId: bridge.id, fechaDesde: futuro },
      100,
      testAdminPrisma,
    );
    const logsDentro = await bridgeLogRepository.listByBridge(
      { bridgeId: bridge.id, fechaDesde: dentroDeRango },
      100,
      testAdminPrisma,
    );

    expect(logsFuera).toHaveLength(0);
    expect(logsDentro).toHaveLength(1);
  });
});
