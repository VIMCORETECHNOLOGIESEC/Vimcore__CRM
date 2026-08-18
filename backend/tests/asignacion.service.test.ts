import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import * as leadEventoRepository from "../src/repositories/lead-evento.repository.js";
import {
  assignAutomatically,
  assignLead,
  assignLeadsBatch,
  asignarTrasCommit,
} from "../src/services/asignacion.service.js";
import type { UsuarioAcceso } from "../src/services/leads.access.js";

/**
 * Mismo truco de inyección de fallos que `ingesta.service.test.ts` (M4):
 * solo `createEvento` se reemplaza por un mock que delega a la
 * implementación real por defecto, así se puede forzar un fallo puntual
 * "durante la asignación" sin tocar el resto de la batería.
 */
vi.mock("../src/repositories/lead-evento.repository.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/repositories/lead-evento.repository.js")>();
  return { ...actual, createEvento: vi.fn(actual.createEvento) };
});

let contador = 0;

async function crearCliente(): Promise<{ id: string }> {
  contador += 1;
  return prisma.cliente.create({
    data: { nombre: `Cliente asignacion ${contador}`, telefonoValido: false },
  });
}

async function crearLeadSinAsignar(): Promise<{ id: string }> {
  const cliente = await crearCliente();
  return prisma.lead.create({
    data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date() },
  });
}

async function crearAsesorActivo(): Promise<{ id: string }> {
  contador += 1;
  return prisma.usuario.create({
    data: {
      nombre: `Asesor asignacion ${contador}`,
      correo: `asesor-asignacion-${contador}@integracion.test`,
      passwordHash: "hash-no-usado",
      rol: "ASESOR",
      activo: true,
    },
  });
}

/**
 * D-A2 (revisión 2, test de guarda de idempotencia): a diferencia del
 * `SUPERVISOR` fijo de abajo (usado solo como actor en pruebas donde el
 * `createEvento` real nunca llega a persistir por el mock de fallo
 * inyectado), esta prueba SÍ escribe `lead_eventos.usuario_id` de verdad —
 * necesita una fila `usuarios` real para no violar la FK.
 */
async function crearSupervisorActivo(): Promise<{ id: string }> {
  contador += 1;
  return prisma.usuario.create({
    data: {
      nombre: `Supervisor asignacion ${contador}`,
      correo: `supervisor-asignacion-${contador}@integracion.test`,
      passwordHash: "hash-no-usado",
      rol: "SUPERVISOR",
      activo: true,
    },
  });
}

const SUPERVISOR: UsuarioAcceso = { id: "00000000-0000-4000-8000-000000000001", rol: "SUPERVISOR" };

afterAll(async () => {
  await prisma.$disconnect();
});

describe("asignacion.service — assignAutomatically (M6, D1/D11)", () => {
  it("prueba obligatoria 5: lead nuevo sale asignado, con slaInicioEn poblado y evento ASIGNACION, en un solo tx", async () => {
    // Aislamiento: la suite completa corre archivos de prueba concurrentes
    // contra la misma BD real; otro archivo (p. ej. leads.access.test.ts)
    // puede haber dejado asesores activos. Desactivarlos garantiza que el
    // ganador de la asignación sea exactamente el candidato de esta prueba.
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });

    const lead = await crearLeadSinAsignar();
    const asesor = await crearAsesorActivo();
    const ahora = new Date();

    await prisma.$transaction(async (tx) => {
      await assignAutomatically(lead.id, ahora, tx);
    });

    const leadActualizado = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadActualizado.asesorId).toBe(asesor.id);
    expect(leadActualizado.slaInicioEn).not.toBeNull();

    const evento = await prisma.leadEvento.findFirst({
      where: { leadId: lead.id, tipo: "ASIGNACION" },
    });
    expect(evento).not.toBeNull();
    expect(evento?.detalle).toMatchObject({ motivo: "automatica", responsableId: asesor.id });

    const usuarioActualizado = await prisma.usuario.findUniqueOrThrow({ where: { id: asesor.id } });
    expect(usuarioActualizado.ultimaAsignacionEn).not.toBeNull();
  });

  it("prueba obligatoria 6: sin asesores activos, el lead queda sin asignar y se escribe SIN_ASIGNAR con requiereNotificacion", async () => {
    // Aislamiento explícito: desactiva CUALQUIER asesor que otra prueba de
    // este archivo haya creado antes (p. ej. la prueba 5), sin depender del
    // orden de ejecución — "sin candidatos" es la precondición del caso.
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });

    const lead = await crearLeadSinAsignar();
    const ahora = new Date();

    await prisma.$transaction(async (tx) => {
      await assignAutomatically(lead.id, ahora, tx);
    });

    const leadActualizado = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadActualizado.asesorId).toBeNull();
    expect(leadActualizado.slaInicioEn).toBeNull();

    const evento = await prisma.leadEvento.findFirst({
      where: { leadId: lead.id, tipo: "SIN_ASIGNAR" },
    });
    expect(evento).not.toBeNull();
    expect(evento?.detalle).toMatchObject({
      requiereNotificacion: true,
      motivo: "sin_candidatos",
      responsableId: null,
    });
  });

  it("prueba obligatoria 11: el FIFO respeta ultimaAsignacionEn — el receptor recien asignado no gana la siguiente ronda en empate", async () => {
    // Aislamiento: ningun asesor de pruebas previas debe competir aqui.
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });

    const asesorA = await crearAsesorActivo();
    const asesorB = await crearAsesorActivo();
    const leadUno = await crearLeadSinAsignar();
    const leadDos = await crearLeadSinAsignar();

    // Ronda 1: ambos en carga 0 y ultimaAsignacionEn null -> gana el id menor.
    const [primerGanadorId] = [asesorA.id, asesorB.id].sort();

    await prisma.$transaction(async (tx) => {
      await assignAutomatically(leadUno.id, new Date(), tx);
    });

    const leadUnoActualizado = await prisma.lead.findUniqueOrThrow({ where: { id: leadUno.id } });
    expect(leadUnoActualizado.asesorId).toBe(primerGanadorId);

    // Ronda 2: el receptor de la ronda 1 ahora tiene ultimaAsignacionEn
    // reciente, así que el FIFO debe elegir al OTRO asesor esta vez, aunque
    // ambos sigan en carga activa 1 (ninguno alcanzó etapa terminal).
    await prisma.$transaction(async (tx) => {
      await assignAutomatically(leadDos.id, new Date(), tx);
    });

    const leadDosActualizado = await prisma.lead.findUniqueOrThrow({ where: { id: leadDos.id } });
    expect(leadDosActualizado.asesorId).not.toBe(primerGanadorId);
    expect([asesorA.id, asesorB.id]).toContain(leadDosActualizado.asesorId);
  });

  it("prueba obligatoria 12: fallo inyectado tras actualizar Lead deja ultimaAsignacionEn intacto y cero lead_eventos (D11, todo o nada)", async () => {
    // Aislamiento: mismo motivo que la prueba 5 — garantiza que el asesor de
    // esta prueba sea el único candidato elegible.
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });

    const lead = await crearLeadSinAsignar();
    const asesor = await crearAsesorActivo();
    const mockCreateEvento = vi.mocked(leadEventoRepository.createEvento);
    mockCreateEvento.mockRejectedValueOnce(new Error("fallo forzado para probar rollback de asignacion"));

    await expect(
      prisma.$transaction(async (tx) => {
        await assignAutomatically(lead.id, new Date(), tx);
      }),
    ).rejects.toThrow("fallo forzado para probar rollback de asignacion");

    const leadTrasFallo = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadTrasFallo.asesorId).toBeNull();
    expect(leadTrasFallo.slaInicioEn).toBeNull();

    const usuarioTrasFallo = await prisma.usuario.findUniqueOrThrow({ where: { id: asesor.id } });
    expect(usuarioTrasFallo.ultimaAsignacionEn).toBeNull();

    const totalEventos = await prisma.leadEvento.count({ where: { leadId: lead.id } });
    expect(totalEventos).toBe(0);
  });
});

describe("asignacion.service — assignLeadsBatch (design D-A1: errores de infraestructura abortan el lote)", () => {
  it("un fallo NO-AppError (infra) a mitad del lote se relanza y aborta el request, sin degradar a fallidos[]", async () => {
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    const asesor = await crearAsesorActivo();
    const leadUno = await crearLeadSinAsignar();
    const leadDos = await crearLeadSinAsignar();

    // Mismo truco de inyección que la prueba obligatoria 12 arriba: el
    // primer `createEvento` de este test (dentro del `assignLead` de
    // `leadUno`) falla con un Error genérico (no `AppError`) — simula un
    // fallo de infraestructura, no un fallo de negocio del lead.
    const mockCreateEvento = vi.mocked(leadEventoRepository.createEvento);
    mockCreateEvento.mockRejectedValueOnce(new Error("fallo de infraestructura simulado"));

    await expect(
      assignLeadsBatch(SUPERVISOR, { leadIds: [leadUno.id, leadDos.id], asesorId: asesor.id }),
    ).rejects.toThrow("fallo de infraestructura simulado");

    // El lote se abortó ANTES de procesar leadDos — no quedó reportado como
    // "fallidos[]", ni tampoco se asignó (D-A1: un error de infra no debe
    // reportarse como "estos leads son inválidos").
    const leadDosTrasFallo = await prisma.lead.findUniqueOrThrow({ where: { id: leadDos.id } });
    expect(leadDosTrasFallo.asesorId).toBeNull();
  });
});

describe("asignacion.service — asignarTrasCommit (D-A2 revisión 2: post-commit con reintento acotado)", () => {
  it("reintenta hasta 3 veces ante fallos transitorios, con backoff, y nunca lanza — éxito en el tercer intento", async () => {
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    const lead = await crearLeadSinAsignar();
    const asesor = await crearAsesorActivo();

    const mockCreateEvento = vi.mocked(leadEventoRepository.createEvento);
    mockCreateEvento.mockRejectedValueOnce(new Error("fallo transitorio 1"));
    mockCreateEvento.mockRejectedValueOnce(new Error("fallo transitorio 2"));

    await expect(asignarTrasCommit(lead.id, new Date())).resolves.toBeUndefined();

    const leadActualizado = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadActualizado.asesorId).toBe(asesor.id);
    expect(leadActualizado.slaInicioEn).not.toBeNull();

    const eventoAsignacion = await prisma.leadEvento.findFirst({
      where: { leadId: lead.id, tipo: "ASIGNACION" },
    });
    expect(eventoAsignacion).not.toBeNull();

    const eventoFallido = await prisma.leadEvento.findFirst({
      where: { leadId: lead.id, tipo: "ASIGNACION_FALLIDA" },
    });
    expect(eventoFallido).toBeNull();
  }, 10_000);

  it('"sin candidatos" cuenta como 1 solo intento (no reintentable) y no escribe ASIGNACION_FALLIDA', async () => {
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    const lead = await crearLeadSinAsignar();

    const mockCreateEvento = vi.mocked(leadEventoRepository.createEvento);
    const llamadasAntes = mockCreateEvento.mock.calls.length;

    await expect(asignarTrasCommit(lead.id, new Date())).resolves.toBeUndefined();

    const leadActualizado = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadActualizado.asesorId).toBeNull();

    const eventoSinAsignar = await prisma.leadEvento.findFirst({
      where: { leadId: lead.id, tipo: "SIN_ASIGNAR" },
    });
    expect(eventoSinAsignar).not.toBeNull();

    const eventoFallido = await prisma.leadEvento.findFirst({
      where: { leadId: lead.id, tipo: "ASIGNACION_FALLIDA" },
    });
    expect(eventoFallido).toBeNull();

    // "Sin candidatos" no lanza, así que el bucle de asignarTrasCommit
    // retorna tras el primer intento — un único createEvento (SIN_ASIGNAR).
    const llamadasDespues = mockCreateEvento.mock.calls.length;
    expect(llamadasDespues - llamadasAntes).toBe(1);
  });
});

describe("asignacion.service — guarda de idempotencia obligatoria (D-A2 revisión 2)", () => {
  it("lead ya asignado manualmente antes del intento automático: assignAutomatically no-opea sin sobrescribir ni generar eventos nuevos", async () => {
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    const lead = await crearLeadSinAsignar();
    const asesorManual = await crearAsesorActivo();
    // Un segundo asesor activo: si la guarda no existiera, sería un
    // candidato válido y el intento automático lo asignaría, pisando la
    // asignación manual del Supervisor.
    await crearAsesorActivo();
    const supervisor = await crearSupervisorActivo();

    await assignLead(
      { id: supervisor.id, rol: "SUPERVISOR" },
      lead.id,
      { asesorId: asesorManual.id },
    );

    const eventosAntes = await prisma.leadEvento.count({ where: { leadId: lead.id } });

    await prisma.$transaction(async (tx) => {
      await assignAutomatically(lead.id, new Date(), tx);
    });

    const leadTrasIntentoAutomatico = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadTrasIntentoAutomatico.asesorId).toBe(asesorManual.id);

    const eventosDespues = await prisma.leadEvento.count({ where: { leadId: lead.id } });
    expect(eventosDespues).toBe(eventosAntes);
  });
});

describe("asignacion.service — degradación tras agotar reintentos (D-A2 revisión 2)", () => {
  it("agota los 3 intentos: escribe ASIGNACION_FALLIDA (requiereNotificacion: true) + bridge_logs ERROR, lead queda sin asesor y listable", async () => {
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    const lead = await crearLeadSinAsignar();
    await crearAsesorActivo();

    const mockCreateEvento = vi.mocked(leadEventoRepository.createEvento);
    mockCreateEvento.mockRejectedValueOnce(new Error("fallo persistente 1"));
    mockCreateEvento.mockRejectedValueOnce(new Error("fallo persistente 2"));
    mockCreateEvento.mockRejectedValueOnce(new Error("fallo persistente 3"));

    await expect(asignarTrasCommit(lead.id, new Date())).resolves.toBeUndefined();

    const leadTrasFallo = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadTrasFallo.asesorId).toBeNull();
    expect(leadTrasFallo.slaInicioEn).toBeNull();

    const eventoFallido = await prisma.leadEvento.findFirst({
      where: { leadId: lead.id, tipo: "ASIGNACION_FALLIDA" },
    });
    expect(eventoFallido).not.toBeNull();
    expect(eventoFallido?.detalle).toMatchObject({
      requiereNotificacion: true,
      motivo: "fallo_asignacion_postcommit",
      intentos: 3,
    });

    const logError = await prisma.bridgeLog.findFirst({
      where: { bridgeId: null, nivel: "ERROR", mensaje: { contains: lead.id } },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(logError).not.toBeNull();

    // Sigue visible/filtrable en el listado de leads sin asignar.
    const leadListable = await prisma.lead.findFirst({ where: { id: lead.id, asesorId: null } });
    expect(leadListable).not.toBeNull();
  }, 10_000);
});
