import { afterAll, describe, expect, it, vi } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import * as leadEventoRepository from "../src/repositories/lead-evento.repository.js";
import { ingestarLead } from "../src/services/ingesta.service.js";
import type { LeadEntrante } from "../src/types/lead-entrante.js";

/**
 * Mismo truco de inyección de fallos que `deduplicacion.service.test.ts`
 * (M3): solo `createEvento` se reemplaza por un mock que delega a la
 * implementación real por defecto, así se puede forzar un único fallo
 * puntual "durante el dedupe" (última escritura de `deduplicateLead`, ya
 * dentro de la misma transacción que abrió `ingestarLead`) sin tocar el
 * resto de la batería, que sigue corriendo contra la BD real de compose.
 */
vi.mock("../src/repositories/lead-evento.repository.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/repositories/lead-evento.repository.js")>();
  return { ...actual, createEvento: vi.fn(actual.createEvento) };
});

let contador = 0;

/** Bridge de prueba con clave de API unica — evita colision del UNIQUE. */
async function crearBridge(): Promise<{ id: string }> {
  contador += 1;
  const bridge = await prisma.bridge.create({
    data: {
      redSocial: "GOOGLE_FORMS",
      nombre: `Bridge de prueba ingesta ${contador}`,
      claveApiHash: hashClaveBridge(`clave-ingesta-${contador}`),
      estado: "ACTIVO",
    },
  });
  return { id: bridge.id };
}

function entradaBase(bridgeId: string, overrides: Partial<LeadEntrante> = {}): LeadEntrante {
  contador += 1;
  const idExternoLead = `externo-ingesta-${contador}`;
  return {
    redSocial: "GOOGLE_FORMS",
    bridgeId,
    nombre: "Cliente de prueba",
    // Prefijo "097" (distinto del "099" de `deduplicacion.service.test.ts`
    // y del "098" de `prisma.runInTransaction.test.ts`) para que ningún
    // teléfono normalizado colisione entre archivos de prueba cuando la
    // suite completa corre sin truncar entre ellos (D-H).
    telefono: `097${String(contador).padStart(7, "0")}`,
    correo: null,
    idExternoLead,
    idExternoCampania: null,
    nombreCampania: null,
    idExternoCuenta: null,
    camposDinamicos: {},
    ingresadoEn: new Date(),
    payloadOriginal: { idExternoLead },
    ...overrides,
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("ingesta.service — ingestarLead (M4, PR3a)", () => {
  it("flujo feliz: recibe, dedupe crea cliente/lead, ancla la recepcion y registra INFO (Requirement: Atomic reception and deduplication, Synchronous processing)", async () => {
    const { id: bridgeId } = await crearBridge();
    const entrada = entradaBase(bridgeId);

    const resultado = await ingestarLead(entrada);

    expect(resultado.duplicado).toBe(false);

    const fila = await prisma.leadRecibido.findFirstOrThrow({
      where: { bridgeId, idExternoLead: entrada.idExternoLead },
    });
    expect(fila.leadId).toBe(resultado.leadId);
    expect(fila.datosIncompletos).toBe(false);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: resultado.leadId } });
    expect(lead.origen).toBe("NUEVO");

    const log = await prisma.bridgeLog.findFirst({
      where: { bridgeId, nivel: "INFO" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log).not.toBeNull();
  });

  it("misma pareja (bridgeId, idExternoLead) entregada concurrentemente produce exactamente un lead (Requirement: Idempotent reception, Scenario: Concurrent duplicate delivery)", async () => {
    const { id: bridgeId } = await crearBridge();
    const entrada = entradaBase(bridgeId);

    const llamadas = Array.from({ length: 5 }, () => ingestarLead(entrada));
    const resultados = await Promise.all(llamadas);

    const leadIds = new Set(resultados.map((r) => r.leadId));
    expect(leadIds.size).toBe(1);
    const [leadId] = [...leadIds];

    const totalRecepciones = await prisma.leadRecibido.count({
      where: { bridgeId, idExternoLead: entrada.idExternoLead },
    });
    expect(totalRecepciones).toBe(1);

    const totalLeads = await prisma.lead.count({ where: { id: leadId } });
    expect(totalLeads).toBe(1);

    const duplicados = resultados.filter((r) => r.duplicado).length;
    expect(duplicados).toBe(4);
  });

  it("telefono y correo nulos: persiste, marca datosIncompletos, registra ADVERTENCIA y no lanza (Requirement: Incomplete-data handling, Scenario: Missing phone and email)", async () => {
    const { id: bridgeId } = await crearBridge();
    const entrada = entradaBase(bridgeId, { telefono: null, correo: null });

    const resultado = await ingestarLead(entrada);

    expect(resultado.duplicado).toBe(false);

    const fila = await prisma.leadRecibido.findFirstOrThrow({
      where: { bridgeId, idExternoLead: entrada.idExternoLead },
    });
    expect(fila.datosIncompletos).toBe(true);
    expect(fila.leadId).toBe(resultado.leadId);

    const log = await prisma.bridgeLog.findFirst({
      where: { bridgeId, nivel: "ADVERTENCIA" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log).not.toBeNull();
  });

  it("fallo inyectado despues de la recepcion, durante el dedupe: revierte recepcion y dedupe completos, sin huerfanos (Scenario: Failure mid-transaction rolls back fully)", async () => {
    const { id: bridgeId } = await crearBridge();
    const entrada = entradaBase(bridgeId);
    const mockCreateEvento = vi.mocked(leadEventoRepository.createEvento);
    mockCreateEvento.mockRejectedValueOnce(new Error("fallo forzado para probar rollback de ingesta"));

    await expect(ingestarLead(entrada)).rejects.toThrow("fallo forzado para probar rollback de ingesta");

    const filaRecepcion = await prisma.leadRecibido.findFirst({
      where: { bridgeId, idExternoLead: entrada.idExternoLead },
    });
    expect(filaRecepcion).toBeNull();

    const cliente = await prisma.cliente.findFirst({
      where: { telefonoOriginal: entrada.telefono },
    });
    expect(cliente).toBeNull();
  });

  it("recepcion revertida seguida de un reintento produce exactamente un lead (verifica xmax=0 tras rollback)", async () => {
    const { id: bridgeId } = await crearBridge();
    const entrada = entradaBase(bridgeId);
    const mockCreateEvento = vi.mocked(leadEventoRepository.createEvento);
    mockCreateEvento.mockRejectedValueOnce(new Error("fallo forzado, reintento posterior"));

    await expect(ingestarLead(entrada)).rejects.toThrow("fallo forzado, reintento posterior");

    const reintento = await ingestarLead(entrada);
    expect(reintento.duplicado).toBe(false);

    const totalRecepciones = await prisma.leadRecibido.count({
      where: { bridgeId, idExternoLead: entrada.idExternoLead },
    });
    expect(totalRecepciones).toBe(1);

    const totalLeads = await prisma.lead.count({ where: { id: reintento.leadId } });
    expect(totalLeads).toBe(1);
  });

  it("la fila ERROR de bridge_logs sobrevive al rollback de la transaccion (Scenario: Error log survives rollback)", async () => {
    const { id: bridgeId } = await crearBridge();
    const entrada = entradaBase(bridgeId);
    const mockCreateEvento = vi.mocked(leadEventoRepository.createEvento);
    mockCreateEvento.mockRejectedValueOnce(new Error("fallo forzado para probar log de error"));

    await expect(ingestarLead(entrada)).rejects.toThrow("fallo forzado para probar log de error");

    const logError = await prisma.bridgeLog.findFirst({
      where: { bridgeId, nivel: "ERROR" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(logError).not.toBeNull();
    expect(logError?.mensaje).toContain("fallo forzado para probar log de error");
  });
});
