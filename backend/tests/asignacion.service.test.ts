import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import * as leadEventoRepository from "../src/repositories/lead-evento.repository.js";
import { assignAutomatically } from "../src/services/asignacion.service.js";

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
