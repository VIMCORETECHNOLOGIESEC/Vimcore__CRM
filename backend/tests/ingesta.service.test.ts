import { afterAll, describe, expect, it, vi } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { eventBroker, type BrokerEvent } from "../src/lib/event-broker.js";
import { prisma } from "../src/lib/prisma.js";
import * as leadEventoRepository from "../src/repositories/lead-evento.repository.js";
import * as leadRecibidoRepository from "../src/repositories/lead-recibido.repository.js";
import * as usuarioRepository from "../src/repositories/usuario.repository.js";
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

/**
 * D-A2 (revisión 2, test 3.11): mismo motivo de aislamiento que
 * `ingesta.routes.test.ts` — mockear `findActivosPorRol` (no `createEvento`)
 * para forzar un retraso real en la asignación POST-commit sin tocar la
 * transacción de ingesta (INGRESO se escribe antes del commit, ajeno a este
 * mock).
 */
vi.mock("../src/repositories/usuario.repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/repositories/usuario.repository.js")>();
  return { ...actual, findActivosPorRol: vi.fn(actual.findActivosPorRol) };
});

vi.mock("../src/repositories/lead-recibido.repository.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/repositories/lead-recibido.repository.js")>();
  return { ...actual, marcarProcesado: vi.fn(actual.marcarProcesado) };
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

describe.skip("contrato sincrónico retirado: cubierto por aceptación HTTP y worker durable", () => {
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

  it("slaInicioEn queda fijado con el instante de ingesta, no con el instante en que la asignación automática efectivamente concluye (Scenario: Reloj SLA no se corre por retraso)", async () => {
    const { id: bridgeId } = await crearBridge();
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    contador += 1;
    const asesor = await prisma.usuario.create({
      data: {
        nombre: `Asesor SLA postcommit ${contador}`,
        correo: `asesor-postcommit-${contador}@integracion.test`,
        passwordHash: "hash-no-usado",
        rol: "ASESOR",
        activo: true,
      },
    });
    const entrada = entradaBase(bridgeId);

    // Un único fallo transitorio en el primer intento fuerza el backoff real
    // de 250ms antes del segundo (y exitoso) intento — así se distingue con
    // certeza entre "instante de ingesta" y "instante en que la asignación
    // efectivamente concluye".
    const mockFindActivos = vi.mocked(usuarioRepository.findActivosPorRol);
    mockFindActivos.mockRejectedValueOnce(new Error("retraso simulado del primer intento"));

    const antes = Date.now();
    const resultado = await ingestarLead(entrada);
    const despues = Date.now();

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: resultado.leadId } });
    expect(lead.asesorId).toBe(asesor.id);
    expect(lead.slaInicioEn).not.toBeNull();

    const slaMs = lead.slaInicioEn!.getTime();
    expect(slaMs).toBeGreaterThanOrEqual(antes);
    expect(slaMs).toBeLessThan(antes + 200);

    // Confirma que sí hubo un retraso real por el backoff (si no, la prueba
    // no distinguiría nada) y que ese retraso NO se filtró a slaInicioEn.
    expect(despues - antes).toBeGreaterThanOrEqual(250);
  }, 10_000);

  it("publica la notificación de interacción repetida solo después del commit de la ingesta real", async () => {
    const { id: bridgeId } = await crearBridge();
    const asesor = await prisma.usuario.create({
      data: {
        nombre: "Asesor interacción repetida",
        correo: `asesor-interaccion-${++contador}@integracion.test`,
        passwordHash: "hash-no-usado",
        rol: "ASESOR",
        activo: true,
      },
    });
    const primeraEntrada = entradaBase(bridgeId);
    const primera = await ingestarLead(primeraEntrada);
    await prisma.lead.update({
      where: { id: primera.leadId },
      data: { asesorId: asesor.id, vendedorId: null },
    });

    const recibidos: BrokerEvent[] = [];
    const unsubscribe = eventBroker.subscribe(asesor.id, undefined, (event) => recibidos.push(event));
    const marcarProcesado = vi.mocked(leadRecibidoRepository.marcarProcesado);
    const marcarProcesadoReal = marcarProcesado.getMockImplementation();
    if (!marcarProcesadoReal) throw new Error("Se requiere la implementación real de marcarProcesado");
    marcarProcesado.mockImplementationOnce(async (...args) => {
      const resultado = await marcarProcesadoReal(...args);
      expect(recibidos).toEqual([]);
      return resultado;
    });

    const repetida = entradaBase(bridgeId, { telefono: primeraEntrada.telefono });
    const resultado = await ingestarLead(repetida);
    unsubscribe();

    expect(resultado.leadId).toBe(primera.leadId);
    expect(
      await prisma.notificacion.count({
        where: {
          usuarioId: asesor.id,
          leadId: primera.leadId,
          tipo: "INTERACCION_REPETIDA",
        },
      }),
    ).toBe(1);
    expect(recibidos).toEqual([
      expect.objectContaining({
        type: "notificacion.nueva",
        data: expect.objectContaining({ tipo: "INTERACCION_REPETIDA" }),
      }),
    ]);
  });

  it("revierte la interacción repetida y no emite SSE si falla la transacción exterior", async () => {
    const { id: bridgeId } = await crearBridge();
    const asesor = await prisma.usuario.create({
      data: {
        nombre: "Asesor rollback interacción",
        correo: `asesor-rollback-interaccion-${++contador}@integracion.test`,
        passwordHash: "hash-no-usado",
        rol: "ASESOR",
        activo: true,
      },
    });
    const primeraEntrada = entradaBase(bridgeId);
    const primera = await ingestarLead(primeraEntrada);
    await prisma.lead.update({
      where: { id: primera.leadId },
      data: { asesorId: asesor.id, vendedorId: null },
    });

    const recibidos: BrokerEvent[] = [];
    const unsubscribe = eventBroker.subscribe(asesor.id, undefined, (event) => recibidos.push(event));
    const marcarProcesado = vi.mocked(leadRecibidoRepository.marcarProcesado);
    const marcarProcesadoReal = marcarProcesado.getMockImplementation();
    if (!marcarProcesadoReal) throw new Error("Se requiere la implementación real de marcarProcesado");
    marcarProcesado.mockImplementationOnce(async (...args) => {
      await marcarProcesadoReal(...args);
      expect(recibidos).toEqual([]);
      throw new Error("fallo posterior a la notificación para probar rollback");
    });

    const repetida = entradaBase(bridgeId, { telefono: primeraEntrada.telefono });
    await expect(ingestarLead(repetida)).rejects.toThrow(
      "fallo posterior a la notificación para probar rollback",
    );
    unsubscribe();

    expect(
      await prisma.notificacion.count({
        where: {
          usuarioId: asesor.id,
          leadId: primera.leadId,
          tipo: "INTERACCION_REPETIDA",
        },
      }),
    ).toBe(0);
    expect(recibidos).toEqual([]);
  });
});

describe("buzón durable de ingesta", () => {
  async function cerrarRecepcionesElegibles(): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE leads_recibidos SET estado = 'PROCESADO', lease_owner = NULL, lease_hasta = NULL WHERE estado <> 'PROCESADO'`,
    );
  }

  it("entrega un único lease bajo reclamos concurrentes y excluye el lease vigente", async () => {
    await cerrarRecepcionesElegibles();
    const { id: bridgeId } = await crearBridge();
    const entrada = entradaBase(bridgeId);
    const ahora = new Date("2026-08-18T00:00:00.000Z");
    await leadRecibidoRepository.aceptarLeadRecibido(entrada, ahora);

    const [primero, segundo] = await Promise.all([
      leadRecibidoRepository.claimNext(ahora, "worker-a"),
      leadRecibidoRepository.claimNext(ahora, "worker-b"),
    ]);
    const claims = [primero, segundo].filter((claim) => claim !== null);

    expect(claims).toHaveLength(1);
    expect(claims[0]).toEqual(
      expect.objectContaining({ intento: 1, leaseOwner: expect.stringMatching(/^worker-[ab]$/) }),
    );
    expect(await leadRecibidoRepository.claimNext(ahora, "worker-c")).toBeNull();
  });

  it("recupera un lease vencido y rechaza al propietario anterior", async () => {
    await cerrarRecepcionesElegibles();
    const { id: bridgeId } = await crearBridge();
    const entrada = entradaBase(bridgeId);
    const inicio = new Date("2026-08-18T01:00:00.000Z");
    const recepcion = await leadRecibidoRepository.aceptarLeadRecibido(entrada, inicio);
    await leadRecibidoRepository.claimNext(inicio, "worker-vencido");

    const recuperado = await leadRecibidoRepository.claimNext(
      new Date(inicio.getTime() + 61_000),
      "worker-recuperacion",
    );
    const propietarioAnteriorAceptado = await leadRecibidoRepository.marcarFallo(
      recepcion.recepcionId,
      "worker-vencido",
      "error tardío",
      new Date(inicio.getTime() + 62_000),
    );

    expect(recuperado).toEqual(
      expect.objectContaining({
        recepcionId: recepcion.recepcionId,
        leaseOwner: "worker-recuperacion",
        intento: 2,
      }),
    );
    expect(propietarioAnteriorAceptado).toBe(false);
  });
});
