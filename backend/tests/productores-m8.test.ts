import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eventBroker } from "../src/lib/event-broker.js";
import { prisma } from "../src/lib/prisma.js";
import { assignAutomatically, assignLead, transferLead } from "../src/services/asignacion.service.js";
import { deduplicateLead } from "../src/services/deduplicacion.service.js";
import { transitionEtapa } from "../src/services/leads.service.js";
import type { UsuarioAcceso } from "../src/services/leads.access.js";

let sequence = 0;
const actor = async (rol: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "VENDEDOR", activo = true) => {
  sequence += 1;
  const user = await prisma.usuario.create({ data: { nombre: `M8 ${sequence}`, correo: `m8-${sequence}@test.local`, passwordHash: "unused", rol, activo } });
  return { id: user.id, rol: user.rol } satisfies UsuarioAcceso;
};
const lead = async (responsables: { asesorId?: string; vendedorId?: string } = {}) => {
  const cliente = await prisma.cliente.create({ data: { nombre: "M8 producer", telefonoValido: false } });
  return prisma.lead.create({ data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), ...responsables } });
};

beforeEach(async () => {
  vi.restoreAllMocks();
  await prisma.notificacion.deleteMany();
});
afterAll(() => prisma.$disconnect());

describe("M8 transactional lead producers", () => {
  it("persists assignment notification and publishes only after commit", async () => {
    const supervisor = await actor("SUPERVISOR");
    const asesor = await actor("ASESOR");
    const target = await lead();
    const publish = vi.spyOn(eventBroker, "publish");
    await assignLead(supervisor, target.id, { asesorId: asesor.id });
    expect(await prisma.notificacion.count({ where: { usuarioId: asesor.id, leadId: target.id, tipo: "LEAD_ASIGNADO" } })).toBe(1);
    expect(publish).toHaveBeenCalledWith(asesor.id, "notificacion.nueva", expect.objectContaining({ tipo: "LEAD_ASIGNADO" }));
    expect(publish).toHaveBeenCalledWith(asesor.id, "lead.asignado", expect.objectContaining({ leadId: target.id }));
  });

  it("rolls back assignment notification and stays silent when the transaction fails", async () => {
    const supervisor = await actor("SUPERVISOR");
    const asesor = await actor("ASESOR");
    const target = await lead();
    const publish = vi.spyOn(eventBroker, "publish");
    await prisma.usuario.delete({ where: { id: supervisor.id } });
    await expect(assignLead(supervisor, target.id, { asesorId: asesor.id })).rejects.toThrow();
    expect(await prisma.notificacion.count({ where: { leadId: target.id } })).toBe(0);
    expect(publish).not.toHaveBeenCalled();
  });

  it("notifies transfer recipient and emits stage changes without creating a notification", async () => {
    const supervisor = await actor("SUPERVISOR");
    const asesor = await actor("ASESOR");
    const vendedor = await actor("VENDEDOR");
    const target = await lead({ asesorId: asesor.id });
    await prisma.lead.update({ where: { id: target.id }, data: { etapa: "CONTACTADO" } });
    const publish = vi.spyOn(eventBroker, "publish");
    await transferLead(supervisor, target.id, { vendedorId: vendedor.id });
    const beforeStage = await prisma.notificacion.count({ where: { leadId: target.id } });
    // M-hardening Bloque A (D1-D3, memoria #82): SUPERVISOR ya no puede
    // cerrar (canClose deniega con "rol"); el vendedor, ya responsable
    // operativo tras el traspaso de arriba, es quien cierra el lead.
    await transitionEtapa(vendedor, target.id, { etapa: "VENTA", montoVenta: 100, productoServicio: "CRM", formaPago: "CONTADO" });
    expect(await prisma.notificacion.count({ where: { usuarioId: vendedor.id, leadId: target.id, tipo: "LEAD_TRASPASADO" } })).toBe(1);
    expect(await prisma.notificacion.count({ where: { leadId: target.id } })).toBe(beforeStage);
    expect(publish).toHaveBeenCalledWith(vendedor.id, "lead.etapa-cambiada", expect.objectContaining({ etapaNueva: "VENTA" }));
  });

  it("fans an unassigned lead out only to active supervisors and administrators", async () => {
    await prisma.usuario.updateMany({ where: { rol: "ASESOR" }, data: { activo: false } });
    const supervisor = await actor("SUPERVISOR");
    const admin = await actor("ADMINISTRADOR");
    const inactive = await actor("SUPERVISOR", false);
    const target = await lead();
    await prisma.$transaction((tx) => assignAutomatically(target.id, new Date(), tx));
    const recipients = await prisma.notificacion.findMany({ where: { leadId: target.id, tipo: "LEAD_SIN_ASIGNAR" }, select: { usuarioId: true } });
    const ids = recipients.map(({ usuarioId }) => usuarioId);
    expect(ids).toContain(supervisor.id);
    expect(ids).toContain(admin.id);
    expect(ids).not.toContain(inactive.id);
  });

  it("notifies the operational owner for a repeated interaction", async () => {
    const asesor = await actor("ASESOR");
    const telefono = `+59399${String(sequence).padStart(7, "0")}`;
    const first = await deduplicateLead({ nombre: "Repeated", telefono, correo: null, ingresadoEn: new Date() });
    await prisma.lead.update({ where: { id: first.leadId }, data: { asesorId: asesor.id } });
    const publish = vi.spyOn(eventBroker, "publish");
    await deduplicateLead({ nombre: "Repeated", telefono, correo: null, ingresadoEn: new Date() });
    expect(await prisma.notificacion.count({ where: { usuarioId: asesor.id, leadId: first.leadId, tipo: "INTERACCION_REPETIDA" } })).toBe(1);
    expect(publish).toHaveBeenCalledWith(asesor.id, "notificacion.nueva", expect.objectContaining({ tipo: "INTERACCION_REPETIDA" }));
  });
});
