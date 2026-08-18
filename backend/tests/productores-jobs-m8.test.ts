import { afterAll, describe, expect, it, vi } from "vitest";
import { SLA_HORAS } from "../src/config/negocio.js";
import { eventBroker } from "../src/lib/event-broker.js";
import { prisma } from "../src/lib/prisma.js";
import * as leadEventoRepository from "../src/repositories/lead-evento.repository.js";
import * as leadRepository from "../src/repositories/lead.repository.js";
import * as notificationRepository from "../src/repositories/notificacion.repository.js";
import { scheduledNotificationProducers } from "../src/jobs/notificaciones-programadas.js";
import { registrarBridgeLog } from "../src/services/bridge-log.service.js";
import { enviarRecordatoriosCita } from "../src/services/citas-recordatorio.service.js";
import { detectLeadsAtrasados } from "../src/services/sla-atrasado.service.js";

vi.mock("../src/repositories/lead.repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/repositories/lead.repository.js")>();
  return { ...actual, findByIdForUpdate: vi.fn(actual.findByIdForUpdate) };
});

vi.mock("../src/repositories/lead-evento.repository.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/repositories/lead-evento.repository.js")>();
  return {
    ...actual,
    createEvento: vi.fn(actual.createEvento),
    findSlaIncumplidoVigente: vi.fn(actual.findSlaIncumplidoVigente),
  };
});

vi.mock("../src/repositories/notificacion.repository.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/repositories/notificacion.repository.js")>();
  return {
    ...actual,
    createNotificacion: vi.fn(actual.createNotificacion),
    findActiveRecipientById: vi.fn(actual.findActiveRecipientById),
  };
});

let sequence = 0;

async function createUsuario(rol: "ASESOR" | "VENDEDOR" | "SUPERVISOR" | "ADMINISTRADOR", activo = true) {
  sequence += 1;
  return prisma.usuario.create({
    data: {
      nombre: `Usuario productor M8 ${sequence}`,
      correo: `productor-m8-${sequence}@integration.test`,
      passwordHash: "unused-hash",
      rol,
      activo,
    },
  });
}

async function createLead(asesorId?: string) {
  sequence += 1;
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente productor M8 ${sequence}`, telefonoValido: false },
  });
  return prisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: "CONTACTADO",
      ingresadoEn: new Date(),
      asesorId,
      slaInicioEn: asesorId
        ? new Date(Date.now() - (SLA_HORAS * 60 * 60 * 1000 + 60_000))
        : null,
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("M8 scheduled and bridge producers", () => {
  it("cuenta el evento SLA persistido aunque no existan destinatarios activos", async () => {
    const destinatariosActivos = await prisma.usuario.findMany({
      where: { activo: true, rol: { in: ["SUPERVISOR", "ADMINISTRADOR"] } },
      select: { id: true },
    });
    await prisma.usuario.updateMany({
      where: { id: { in: destinatariosActivos.map(({ id }) => id) } },
      data: { activo: false },
    });

    try {
      sequence += 1;
      const cliente = await prisma.cliente.create({
        data: { nombre: `Cliente SLA sin destinatarios ${sequence}`, telefonoValido: false },
      });
      const lead = await prisma.lead.create({
        data: {
          clienteId: cliente.id,
          origen: "NUEVO",
          etapa: "CONTACTADO",
          ingresadoEn: new Date("1999-12-01T00:00:00.000Z"),
          slaInicioEn: new Date("1999-12-02T00:00:00.000Z"),
        },
      });

      const resultado = await detectLeadsAtrasados(new Date("2000-01-10T00:00:00.000Z"));

      expect(resultado.eventosCreados).toBe(1);
      expect(
        await prisma.leadEvento.count({ where: { leadId: lead.id, tipo: "SLA_INCUMPLIDO" } }),
      ).toBe(1);
      expect(await prisma.notificacion.count({ where: { leadId: lead.id } })).toBe(0);
    } finally {
      await prisma.usuario.updateMany({
        where: { id: { in: destinatariosActivos.map(({ id }) => id) } },
        data: { activo: true },
      });
    }
  });

  it("crea un solo SLA bajo concurrencia y publica a destinatarios normales después del commit", async () => {
    const asesor = await createUsuario("ASESOR");
    const supervisor = await createUsuario("SUPERVISOR");
    const inactiveSupervisor = await createUsuario("SUPERVISOR", false);
    const lead = await createLead(asesor.id);

    const received: Array<{ userId: string; leadId: string }> = [];
    const visibilityChecks: Array<Promise<boolean>> = [];
    const subscriptions = [asesor.id, supervisor.id].map((userId) =>
      eventBroker.subscribe(userId, undefined, ({ data }) => {
        const notification = data as { id: string; leadId: string };
        received.push({ userId, leadId: notification.leadId });
        visibilityChecks.push(
          prisma.notificacion.findUnique({ where: { id: notification.id } }).then(Boolean),
        );
      }),
    );
    const resultados = await Promise.all([detectLeadsAtrasados(), detectLeadsAtrasados()]);
    subscriptions.forEach((unsubscribe) => unsubscribe());

    expect(resultados.reduce((total, resultado) => total + resultado.eventosCreados, 0)).toBe(1);
    expect(await prisma.leadEvento.count({ where: { leadId: lead.id, tipo: "SLA_INCUMPLIDO" } })).toBe(1);
    const notifications = await prisma.notificacion.findMany({
      where: { leadId: lead.id, tipo: "LEAD_SIN_ATENDER" },
    });
    expect(notifications.some(({ usuarioId }) => usuarioId === asesor.id)).toBe(true);
    expect(notifications.some(({ usuarioId }) => usuarioId === supervisor.id)).toBe(true);
    expect(new Set(notifications.map(({ usuarioId }) => usuarioId)).size).toBe(notifications.length);
    expect(notifications.some(({ usuarioId }) => usuarioId === inactiveSupervisor.id)).toBe(false);
    expect(notifications.every(({ mensaje }) => mensaje === "El SLA de atención del lead ha vencido")).toBe(true);
    expect(received.filter(({ leadId }) => leadId === lead.id)).toEqual(
      expect.arrayContaining([
        { userId: asesor.id, leadId: lead.id },
        { userId: supervisor.id, leadId: lead.id },
      ]),
    );
    expect(await Promise.all(visibilityChecks)).not.toContain(false);
  });

  it("revierte el evento SLA si falla una escritura de notificación en la misma transacción", async () => {
    const asesor = await createUsuario("ASESOR");
    const lead = await createLead(asesor.id);
    vi.mocked(notificationRepository.createNotificacion).mockRejectedValueOnce(
      new Error("fallo de notificación inyectado"),
    );

    await expect(detectLeadsAtrasados()).rejects.toThrow("fallo de notificación inyectado");

    expect(await prisma.leadEvento.count({ where: { leadId: lead.id, tipo: "SLA_INCUMPLIDO" } })).toBe(0);
    expect(await prisma.notificacion.count({ where: { leadId: lead.id } })).toBe(0);

    const lockCall = vi.mocked(leadRepository.findByIdForUpdate).mock.calls.find(([id]) => id === lead.id);
    const currentWindowCall = vi
      .mocked(leadEventoRepository.findSlaIncumplidoVigente)
      .mock.calls.find(([leadId]) => leadId === lead.id);
    const eventCall = vi
      .mocked(leadEventoRepository.createEvento)
      .mock.calls.find(([data]) => data.leadId === lead.id && data.tipo === "SLA_INCUMPLIDO");
    const ownerCall = vi
      .mocked(notificationRepository.findActiveRecipientById)
      .mock.calls.find(([id]) => id === asesor.id);
    const notificationCall = vi
      .mocked(notificationRepository.createNotificacion)
      .mock.calls.find(([data]) => data.leadId === lead.id);
    const tx = lockCall?.[1];

    expect(tx).toBeDefined();
    expect(currentWindowCall?.[2]).toBe(tx);
    expect(eventCall?.[1]).toBe(tx);
    expect(ownerCall?.[1]).toBe(tx);
    expect(notificationCall?.[1]).toBe(tx);
  });

  it("claims an appointment reminder once under concurrent executions and publishes only after commit", async () => {
    const vendedor = await createUsuario("VENDEDOR");
    const lead = await createLead();
    const cita = await prisma.cita.create({
      data: {
        leadId: lead.id,
        usuarioId: vendedor.id,
        programadaPara: new Date(Date.now() + 30 * 60 * 1000),
        modalidad: "VIRTUAL",
      },
    });

    const received: string[] = [];
    const unsubscribe = eventBroker.subscribe(vendedor.id, undefined, ({ type }) => received.push(type));
    await Promise.all([enviarRecordatoriosCita(), enviarRecordatoriosCita()]);
    unsubscribe();

    expect(await prisma.notificacion.count({ where: { leadId: lead.id, tipo: "RECORDATORIO_CITA" } })).toBe(1);
    expect((await prisma.cita.findUniqueOrThrow({ where: { id: cita.id } })).recordatorioEnviado).toBe(true);
    expect(received).toEqual(["notificacion.nueva"]);
  });

  it("commits an ERROR bridge log atomically with notifications for active administrators only", async () => {
    const activeAdmin = await createUsuario("ADMINISTRADOR");
    const inactiveAdmin = await createUsuario("ADMINISTRADOR", false);
    sequence += 1;
    const bridge = await prisma.bridge.create({
      data: {
        redSocial: "FACEBOOK",
        nombre: `Bridge productor M8 ${sequence}`,
        claveApiHash: `bridge-m8-${sequence}`,
        estado: "ACTIVO",
      },
    });

    const log = await registrarBridgeLog({
      bridgeId: bridge.id,
      nivel: "ERROR",
      mensaje: "Firma inválida",
      payload: { reason: "invalid_signature" },
    });

    expect(await prisma.bridgeLog.findUnique({ where: { id: log.id } })).not.toBeNull();
    const notifications = await prisma.notificacion.findMany({ where: { tipo: "ERROR_BRIDGE" } });
    expect(notifications.some(({ usuarioId }) => usuarioId === activeAdmin.id)).toBe(true);
    expect(notifications.some(({ usuarioId }) => usuarioId === inactiveAdmin.id)).toBe(false);
  });

  it("does not create ERROR_BRIDGE notifications for a committed INFO log", async () => {
    const before = await prisma.notificacion.count({ where: { tipo: "ERROR_BRIDGE" } });
    await registrarBridgeLog({ bridgeId: null, nivel: "INFO", mensaje: "Bridge healthy" });
    expect(await prisma.notificacion.count({ where: { tipo: "ERROR_BRIDGE" } })).toBe(before);
  });

  it("runs every registered notification producer without fabricating TOKEN_POR_EXPIRAR when bridges have no expiry lifecycle", async () => {
    const admin = await createUsuario("ADMINISTRADOR");
    const asesor = await createUsuario("ASESOR");
    const vendedor = await createUsuario("VENDEDOR");
    const slaLead = await createLead(asesor.id);
    const citaLead = await createLead();
    const ahora = new Date();
    await prisma.cita.create({
      data: {
        leadId: citaLead.id,
        usuarioId: vendedor.id,
        programadaPara: new Date(ahora.getTime() + 30 * 60 * 1000),
        modalidad: "VIRTUAL",
      },
    });
    sequence += 1;
    const bridge = await prisma.bridge.create({
      data: {
        redSocial: "FACEBOOK",
        nombre: `Bridge sin ciclo de expiración ${sequence}`,
        claveApiHash: `bridge-sin-expiracion-${sequence}`,
        estado: "ACTIVO",
      },
    });
    const tokenNotificationsBefore = await prisma.notificacion.count({
      where: { tipo: "TOKEN_POR_EXPIRAR" },
    });

    const bridgeLog = await registrarBridgeLog({
      bridgeId: bridge.id,
      nivel: "ERROR",
      mensaje: "Error real sin metadatos de expiración",
    });
    const slaResult = await scheduledNotificationProducers.sla(ahora);
    const appointmentResult = await scheduledNotificationProducers.appointments(ahora);

    expect(bridgeLog.nivel).toBe("ERROR");
    expect(slaResult.eventosCreados).toBeGreaterThan(0);
    expect(appointmentResult.recordatoriosMarcados).toBeGreaterThan(0);
    expect(
      await prisma.notificacion.count({ where: { usuarioId: admin.id, tipo: "ERROR_BRIDGE" } }),
    ).toBeGreaterThan(0);
    expect(
      await prisma.notificacion.count({ where: { leadId: slaLead.id, tipo: "LEAD_SIN_ATENDER" } }),
    ).toBeGreaterThan(0);
    expect(
      await prisma.notificacion.count({
        where: { leadId: citaLead.id, tipo: "RECORDATORIO_CITA" },
      }),
    ).toBe(1);
    expect(await prisma.notificacion.count({ where: { tipo: "TOKEN_POR_EXPIRAR" } })).toBe(
      tokenNotificationsBefore,
    );
  });
});
