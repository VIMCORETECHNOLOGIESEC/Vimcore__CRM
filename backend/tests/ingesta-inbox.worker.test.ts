import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import * as inbox from "../src/repositories/lead-recibido.repository.js";
import * as asignacion from "../src/services/asignacion.service.js";
import * as committedEvents from "../src/services/committed-events.service.js";
import * as metricasBroadcast from "../src/lib/metricas-broadcast.js";
import { procesarRecepcion } from "../src/services/ingesta.service.js";
import { startIngestionWorker } from "../src/jobs/ingesta-inbox.job.js";
import { shutdownBackend } from "../src/server-lifecycle.js";
import type { LeadEntrante } from "../src/types/lead-entrante.js";

vi.mock("../src/repositories/lead-recibido.repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/repositories/lead-recibido.repository.js")>();
  return { ...actual, completeClaim: vi.fn(actual.completeClaim) };
});
vi.mock("../src/services/asignacion.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/asignacion.service.js")>();
  return { ...actual, assignAfterCommit: vi.fn(actual.assignAfterCommit) };
});
vi.mock("../src/services/committed-events.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/committed-events.service.js")>();
  return { ...actual, publishCommittedEvents: vi.fn(actual.publishCommittedEvents) };
});
// Mock puro: NO delega a la implementación real (que programaría un
// `setTimeout` real de 2s contra el `eventBroker` singleton de producción,
// sin que este archivo use fake timers) — solo registra la llamada.
vi.mock("../src/lib/metricas-broadcast.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/metricas-broadcast.js")>();
  return { ...actual, scheduleMetricasBroadcast: vi.fn() };
});

let sequence = 0;
async function entrada(): Promise<LeadEntrante> {
  const n = ++sequence;
  const bridge = await prisma.bridge.create({ data: { redSocial: "GOOGLE_FORMS", nombre: `Inbox ${n}`, claveApiHash: `inbox-${n}`, estado: "ACTIVO" } });
  return { redSocial: "GOOGLE_FORMS", bridgeId: bridge.id, nombre: `Inbox ${n}`, telefono: `095${String(n).padStart(7, "0")}`, correo: null, idExternoLead: `inbox-${n}`, idExternoCampania: null, nombreCampania: null, idExternoCuenta: null, camposDinamicos: {}, ingresadoEn: new Date("2026-08-18T02:00:00Z"), payloadOriginal: { n } };
}
beforeEach(() => vi.clearAllMocks());
afterAll(() => prisma.$disconnect());

describe("trabajador del buzón de ingesta", () => {
  it("programa 60s/300s y termina en FALLA_MANUAL tras tres intentos", async () => {
    const input = await entrada();
    const inicio = new Date();
    const receipt = await inbox.aceptarLeadRecibido(input, inicio);
    for (const [index, delay] of [60_000, 300_000, 0].entries()) {
      const now = new Date(inicio.getTime() + (index === 0 ? 0 : index === 1 ? 60_000 : 360_000));
      await prisma.leadRecibido.update({ where: { id: receipt.recepcionId }, data: { estado: "PROCESANDO", intentos: index + 1, leaseOwner: `worker-${index}`, leaseHasta: new Date(now.getTime() + 60_000) } });
      expect(await inbox.marcarFallo(receipt.recepcionId, `worker-${index}`, `fallo ${index + 1}`, now)).toBe(true);
      const row = await prisma.leadRecibido.findUniqueOrThrow({ where: { id: receipt.recepcionId } });
      expect(row.intentos).toBe(index + 1);
      expect(row.estado).toBe(index === 2 ? "FALLA_MANUAL" : "REINTENTO");
      if (delay) expect(row.disponibleEn.getTime()).toBe(now.getTime() + delay);
      expect(row.ultimoError).toBe(`fallo ${index + 1}`);
    }
  });

  it("revierte dominio sin efectos y solo publica/asigna después de completar", async () => {
    const input = await entrada();
    const now = new Date();
    const receipt = await inbox.aceptarLeadRecibido(input, now);
    const row = await prisma.leadRecibido.update({ where: { id: receipt.recepcionId }, data: { estado: "PROCESANDO", intentos: 1, leaseOwner: "worker-atomic", leaseHasta: new Date(now.getTime() + 60_000) } });
    const claim: inbox.InboxClaim = { recepcionId: row.id, leaseOwner: "worker-atomic", intento: 1, leaseHasta: row.leaseHasta!, entradaProcesamiento: row.entradaProcesamiento as unknown as inbox.PersistedLeadEntranteV1 };
    vi.mocked(inbox.completeClaim).mockRejectedValueOnce(new Error("fallo de finalización"));
    await expect(procesarRecepcion(claim)).rejects.toThrow("fallo de finalización");
    expect(vi.mocked(committedEvents.publishCommittedEvents)).not.toHaveBeenCalled();
    expect(vi.mocked(asignacion.assignAfterCommit)).not.toHaveBeenCalled();
    expect((await prisma.leadRecibido.findUniqueOrThrow({ where: { id: receipt.recepcionId } })).leadId).toBeNull();

    vi.mocked(inbox.completeClaim).mockImplementationOnce(async (...args) => {
      expect(vi.mocked(committedEvents.publishCommittedEvents)).not.toHaveBeenCalled();
      expect(vi.mocked(asignacion.assignAfterCommit)).not.toHaveBeenCalled();
      return (await vi.importActual<typeof inbox>("../src/repositories/lead-recibido.repository.js")).completeClaim(...args);
    });
    expect(await procesarRecepcion(claim)).toBe(true);
    expect(vi.mocked(committedEvents.publishCommittedEvents)).toHaveBeenCalledAfter(
      vi.mocked(inbox.completeClaim),
    );
    expect(vi.mocked(asignacion.assignAfterCommit)).toHaveBeenCalledAfter(
      vi.mocked(inbox.completeClaim),
    );

    const expiredReceipt = await inbox.aceptarLeadRecibido(await entrada());
    const expired = await prisma.leadRecibido.update({ where: { id: expiredReceipt.recepcionId }, data: { estado: "PROCESANDO", intentos: 1, leaseOwner: "worker-expired", leaseHasta: new Date(Date.now() - 1_000) } });
    const expiredClaim = { recepcionId: expired.id, leaseOwner: "worker-expired", intento: 1, leaseHasta: expired.leaseHasta!, entradaProcesamiento: expired.entradaProcesamiento as unknown as inbox.PersistedLeadEntranteV1 } satisfies inbox.InboxClaim;
    expect(await procesarRecepcion(expiredClaim)).toBe(false);
    expect(await inbox.marcarFallo(expired.id, "worker-expired", "fallo tardío", new Date(0))).toBe(false);
    expect(await prisma.leadRecibido.findUniqueOrThrow({ where: { id: expired.id } })).toMatchObject({ estado: "PROCESANDO", leadId: null, ultimoError: null });
  });

  it("registra ADVERTENCIA en bridge_logs cuando el lead resuelto no tiene telefono ni correo (v1 generico, docs/05-bridges.md §8)", async () => {
    const base = await entrada();
    const input: LeadEntrante = { ...base, telefono: null, correo: null };
    const now = new Date();
    const receipt = await inbox.aceptarLeadRecibido(input, now);
    const row = await prisma.leadRecibido.update({ where: { id: receipt.recepcionId }, data: { estado: "PROCESANDO", intentos: 1, leaseOwner: "worker-advertencia", leaseHasta: new Date(now.getTime() + 60_000) } });
    const claim: inbox.InboxClaim = { recepcionId: row.id, leaseOwner: "worker-advertencia", intento: 1, leaseHasta: row.leaseHasta!, entradaProcesamiento: row.entradaProcesamiento as unknown as inbox.PersistedLeadEntranteV1 };

    expect(await procesarRecepcion(claim)).toBe(true);

    const log = await prisma.bridgeLog.findFirst({ where: { bridgeId: input.bridgeId, nivel: "ADVERTENCIA" }, orderBy: { ocurridoEn: "desc" } });
    expect(log?.mensaje).toContain("datos incompletos");
  });

  it("registra INFO en bridge_logs cuando el lead resuelto tiene telefono (v1 generico)", async () => {
    const input = await entrada();
    const now = new Date();
    const receipt = await inbox.aceptarLeadRecibido(input, now);
    const row = await prisma.leadRecibido.update({ where: { id: receipt.recepcionId }, data: { estado: "PROCESANDO", intentos: 1, leaseOwner: "worker-info", leaseHasta: new Date(now.getTime() + 60_000) } });
    const claim: inbox.InboxClaim = { recepcionId: row.id, leaseOwner: "worker-info", intento: 1, leaseHasta: row.leaseHasta!, entradaProcesamiento: row.entradaProcesamiento as unknown as inbox.PersistedLeadEntranteV1 };

    expect(await procesarRecepcion(claim)).toBe(true);

    const advertencia = await prisma.bridgeLog.findFirst({ where: { bridgeId: input.bridgeId, nivel: "ADVERTENCIA" } });
    expect(advertencia).toBeNull();
    const info = await prisma.bridgeLog.findFirst({ where: { bridgeId: input.bridgeId, nivel: "INFO" }, orderBy: { ocurridoEn: "desc" } });
    expect(info).not.toBeNull();
  });

  it("actualiza ultimoLeadEn del bridge tras procesar la recepcion (docs/05-bridges.md §8)", async () => {
    const input = await entrada();
    const antes = await prisma.bridge.findUniqueOrThrow({ where: { id: input.bridgeId } });
    expect(antes.ultimoLeadEn).toBeNull();
    const now = new Date();
    const receipt = await inbox.aceptarLeadRecibido(input, now);
    const row = await prisma.leadRecibido.update({ where: { id: receipt.recepcionId }, data: { estado: "PROCESANDO", intentos: 1, leaseOwner: "worker-ultimo-lead", leaseHasta: new Date(now.getTime() + 60_000) } });
    const claim: inbox.InboxClaim = { recepcionId: row.id, leaseOwner: "worker-ultimo-lead", intento: 1, leaseHasta: row.leaseHasta!, entradaProcesamiento: row.entradaProcesamiento as unknown as inbox.PersistedLeadEntranteV1 };

    expect(await procesarRecepcion(claim)).toBe(true);

    const despues = await prisma.bridge.findUniqueOrThrow({ where: { id: input.bridgeId } });
    expect(despues.ultimoLeadEn).not.toBeNull();
    expect(despues.ultimoLeadEn!.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });

  it("M9: programa la señal de métricas tras procesar la recepción con éxito (docs/08-dashboard-kpis.md §5, ingreso de lead)", async () => {
    const input = await entrada();
    const now = new Date();
    const receipt = await inbox.aceptarLeadRecibido(input, now);
    const row = await prisma.leadRecibido.update({ where: { id: receipt.recepcionId }, data: { estado: "PROCESANDO", intentos: 1, leaseOwner: "worker-metricas", leaseHasta: new Date(now.getTime() + 60_000) } });
    const claim: inbox.InboxClaim = { recepcionId: row.id, leaseOwner: "worker-metricas", intento: 1, leaseHasta: row.leaseHasta!, entradaProcesamiento: row.entradaProcesamiento as unknown as inbox.PersistedLeadEntranteV1 };

    expect(await procesarRecepcion(claim)).toBe(true);

    // >=1 en vez de exactamente 1: un lead nuevo dispara TANTO el hook de
    // "ingreso de lead" (procesarRecepcion) COMO el de "asignación"
    // (assignAfterCommit -> applyAsignacion) cuando hay un asesor activo
    // disponible — ambos son disparos legítimos del mismo evento de negocio,
    // el debounce de 2s de metricas-broadcast.ts absorbe la duplicación.
    expect(vi.mocked(metricasBroadcast.scheduleMetricasBroadcast)).toHaveBeenCalled();
  });

  it("detiene reclamos y espera el trabajo activo antes de resolver el drenaje", async () => {
    vi.useFakeTimers();
    let resolveWork!: () => void;
    const runOnce = vi.fn(() => new Promise<void>((resolve) => { resolveWork = resolve; }));
    const worker = startIngestionWorker({ pollMs: 1, runOnce });
    expect(startIngestionWorker({ pollMs: 1, runOnce })).toBe(worker);
    await vi.advanceTimersByTimeAsync(1);
    const drained = worker.stopAndDrain();
    await vi.advanceTimersByTimeAsync(10);
    expect(runOnce).toHaveBeenCalledTimes(1);
    let finished = false;
    void drained.then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    resolveWork();
    await drained;
    expect(finished).toBe(true);
    vi.useRealTimers();
  });

  it("drena el worker antes de desconectar Prisma durante el apagado", async () => {
    const order: string[] = [];
    let release!: () => void;
    const shutdown = shutdownBackend({
      stopTimers: () => order.push("timers"),
      closeHttp: async () => { order.push("http"); },
      stopAndDrain: async () => { order.push("drain"); await new Promise<void>((resolve) => { release = resolve; }); },
      disconnect: async () => { order.push("disconnect"); },
    });
    await Promise.resolve();
    expect(order).toEqual(["timers", "http", "drain"]);
    release();
    await shutdown;
    expect(order).toEqual(["timers", "http", "drain", "disconnect"]);
  });
});
