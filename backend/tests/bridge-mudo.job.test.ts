import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BRIDGE_MUDO_HORAS } from "../src/config/negocio.js";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { startBridgeMudoJob } from "../src/jobs/bridge-mudo.job.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import * as bridgeRepository from "../src/repositories/bridge.repository.js";
import * as bridgeLogService from "../src/services/bridge-log.service.js";
import {
  detectarBridgesMudos,
  type ResultadoDeteccionMudos,
} from "../src/services/bridge-mudo.service.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

vi.mock("../src/services/bridge-log.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/bridge-log.service.js")>();
  return { ...actual, registrarBridgeLog: vi.fn(actual.registrarBridgeLog) };
});

const UMBRAL_MS = BRIDGE_MUDO_HORAS * 60 * 60 * 1000;

let contador = 0;

function claveApiUnica(): string {
  contador += 1;
  return `clave-bridge-mudo-${contador}`;
}

async function crearBridgeMudo(overrides: {
  horasSinLead?: number;
  estado?: "ACTIVO" | "INACTIVO" | "TOKEN_EXPIRADO" | "ERROR";
} = {}): Promise<{ id: string }> {
  contador += 1;
  const horasSinLead = overrides.horasSinLead ?? 73;
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      redSocial: "GOOGLE_FORMS",
      nombre: `Bridge mudo job ${contador}`,
      claveApiHash: hashClaveBridge(claveApiUnica()),
      estado: overrides.estado ?? "ACTIVO",
      ultimoLeadEn: new Date(Date.now() - horasSinLead * 60 * 60 * 1000),
      empresaId: EMPRESA_BOOTSTRAP_ID,
    },
  });
  return { id: bridge.id };
}

beforeEach(() => vi.clearAllMocks());

afterAll(async () => {
  await prisma.$disconnect();
});

describe("bridge-mudo.service — detectarBridgesMudos (docs/05-bridges.md §8)", () => {
  it("registra una advertencia ADVERTENCIA en bridge_logs y marca advertenciaMudoEnviada=true", async () => {
    const { id } = await crearBridgeMudo();
    const ahora = new Date();

    const resultado = await detectarBridgesMudos(ahora);

    expect(resultado.candidatos).toBeGreaterThanOrEqual(1);
    expect(resultado.advertenciasRegistradas).toBeGreaterThanOrEqual(1);
    const log = await prisma.bridgeLog.findFirst({
      where: { bridgeId: id, nivel: "ADVERTENCIA" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log?.mensaje).toContain("72h");
    const bridge = await testAdminPrisma.bridge.findUniqueOrThrow({ where: { id } });
    expect(bridge.advertenciaMudoEnviada).toBe(true);
  });

  it("una segunda corrida inmediata no repite la advertencia para el mismo bridge (anti-spam)", async () => {
    const { id } = await crearBridgeMudo();
    const ahora = new Date();

    const primera = await detectarBridgesMudos(ahora);
    expect(primera.advertenciasRegistradas).toBeGreaterThanOrEqual(1);
    const logsAntes = await prisma.bridgeLog.count({ where: { bridgeId: id, nivel: "ADVERTENCIA" } });

    await detectarBridgesMudos(new Date(ahora.getTime() + 1000));

    const logsDespues = await prisma.bridgeLog.count({ where: { bridgeId: id, nivel: "ADVERTENCIA" } });
    expect(logsDespues).toBe(logsAntes);
  });

  it("un lead nuevo (touchUltimoLeadEn) re-arma la deteccion tras una advertencia previa", async () => {
    const { id } = await crearBridgeMudo();
    await detectarBridgesMudos(new Date());
    expect((await testAdminPrisma.bridge.findUniqueOrThrow({ where: { id } })).advertenciaMudoEnviada).toBe(true);

    await bridgeRepository.touchUltimoLeadEn(id, testAdminPrisma);
    expect((await testAdminPrisma.bridge.findUniqueOrThrow({ where: { id } })).advertenciaMudoEnviada).toBe(false);

    const ahoraSimulado = new Date(Date.now() + UMBRAL_MS + 60 * 60 * 1000);
    const resultado = await detectarBridgesMudos(ahoraSimulado);

    const log = await prisma.bridgeLog.findMany({
      where: { bridgeId: id, nivel: "ADVERTENCIA" },
      orderBy: { ocurridoEn: "asc" },
    });
    expect(log).toHaveLength(2);
    expect(resultado.advertenciasRegistradas).toBeGreaterThanOrEqual(1);
  });

  it("no genera advertencias cuando no hay bridges candidatos", async () => {
    const resultado = await detectarBridgesMudos(new Date("1999-01-01T00:00:00.000Z"));
    expect(resultado).toEqual({ candidatos: 0, advertenciasRegistradas: 0 });
  });

  it("ignora un bridge INACTIVO aunque su ultimoLeadEn haya vencido hace mas de 72h", async () => {
    const { id } = await crearBridgeMudo({ estado: "INACTIVO" });

    await detectarBridgesMudos(new Date());

    const log = await prisma.bridgeLog.findFirst({ where: { bridgeId: id } });
    expect(log).toBeNull();
  });

  it("si falla el registro en bridge_logs, NO marca advertenciaMudoEnviada — el bridge se re-evalua en el siguiente tick (code-review, orden log-primero)", async () => {
    const { id } = await crearBridgeMudo();
    vi.mocked(bridgeLogService.registrarBridgeLog).mockRejectedValueOnce(
      new Error("fallo simulado de bridge_logs"),
    );

    const primerTick = await detectarBridgesMudos(new Date());

    expect(primerTick.advertenciasRegistradas).toBe(0);
    expect((await testAdminPrisma.bridge.findUniqueOrThrow({ where: { id } })).advertenciaMudoEnviada).toBe(false);

    const segundoTick = await detectarBridgesMudos(new Date());

    expect(segundoTick.advertenciasRegistradas).toBeGreaterThanOrEqual(1);
    expect((await testAdminPrisma.bridge.findUniqueOrThrow({ where: { id } })).advertenciaMudoEnviada).toBe(true);
  });
});

describe("bridge-mudo.job — startBridgeMudoJob, guarda de re-entrada (mismo patron que sla-atrasado.job)", () => {
  it("descarta un tick mientras el anterior sigue en curso, y retoma en el siguiente disparo", async () => {
    vi.useFakeTimers();
    try {
      let resolverPrimeraCorrida: (() => void) | undefined;
      const detectarMock = vi.fn(
        () =>
          new Promise<ResultadoDeteccionMudos>((resolve) => {
            resolverPrimeraCorrida = () => resolve({ candidatos: 0, advertenciasRegistradas: 0 });
          }),
      );

      startBridgeMudoJob(1000, detectarMock);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);
      expect(detectarMock).toHaveBeenCalledTimes(1);

      resolverPrimeraCorrida?.();
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(1000);
      expect(detectarMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
