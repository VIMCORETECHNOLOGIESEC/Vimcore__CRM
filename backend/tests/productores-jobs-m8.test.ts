import { afterAll, describe, expect, it } from "vitest";
import { SLA_HORAS } from "../src/config/negocio.js";
import { eventBroker } from "../src/lib/event-broker.js";
import { prisma } from "../src/lib/prisma.js";
import { registrarBridgeLog } from "../src/services/bridge-log.service.js";
import { enviarRecordatoriosCita } from "../src/services/citas-recordatorio.service.js";
import { detectLeadsAtrasados } from "../src/services/sla-atrasado.service.js";

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
  it("claims an overdue SLA once under concurrent executions and notifies owner plus active supervisors", async () => {
    const asesor = await createUsuario("ASESOR");
    const supervisor = await createUsuario("SUPERVISOR");
    const inactiveSupervisor = await createUsuario("SUPERVISOR", false);
    const lead = await createLead(asesor.id);

    await Promise.all([detectLeadsAtrasados(), detectLeadsAtrasados()]);

    expect(await prisma.leadEvento.count({ where: { leadId: lead.id, tipo: "SLA_INCUMPLIDO" } })).toBe(1);
    const notifications = await prisma.notificacion.findMany({
      where: { leadId: lead.id, tipo: "LEAD_SIN_ATENDER" },
    });
    expect(notifications.some(({ usuarioId }) => usuarioId === asesor.id)).toBe(true);
    expect(notifications.some(({ usuarioId }) => usuarioId === supervisor.id)).toBe(true);
    expect(new Set(notifications.map(({ usuarioId }) => usuarioId)).size).toBe(notifications.length);
    expect(notifications.some(({ usuarioId }) => usuarioId === inactiveSupervisor.id)).toBe(false);
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
});
