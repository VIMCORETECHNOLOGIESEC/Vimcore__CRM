import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { eventBroker } from "../src/lib/event-broker.js";
import { prisma } from "../src/lib/prisma.js";
import { assignAutomatically, assignLead, transferLead } from "../src/services/asignacion.service.js";
import { deduplicateLead } from "../src/services/deduplicacion.service.js";
import { transitionEtapa } from "../src/services/leads.service.js";
import type { UsuarioAcceso } from "../src/services/leads.access.js";

let sequence = 0;
const BOOTSTRAP_EMPRESA_ID = "00000000-0000-0000-0000-000000000001";
// Bloque C (D2): ADMINISTRADOR/SUPERVISOR resuelven `empresaId: null`
// (holding-wide) incondicionalmente en producción (`require-authentication.middleware.ts`)
// — este helper construye el `UsuarioAcceso` a mano (sin pasar por el
// middleware) para llamar los servicios directamente, así que replica ese
// mismo criterio: ASESOR/VENDEDOR quedan acotados a la empresa bootstrap
// (misma empresa que `lead()` de abajo), Admin/Supervisor quedan `null`.
const actor = async (rol: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "VENDEDOR", activo = true) => {
  sequence += 1;
  const user = await prisma.usuario.create({ data: { nombre: `M8 ${sequence}`, correo: `m8-${sequence}@test.local`, passwordHash: "unused", rol, activo } });
  const empresaId = rol === "ADMINISTRADOR" || rol === "SUPERVISOR" ? null : BOOTSTRAP_EMPRESA_ID;
  return { id: user.id, rol: user.rol, empresaId } satisfies UsuarioAcceso;
};
const lead = async (responsables: { asesorId?: string; vendedorId?: string } = {}) => {
  const cliente = await prisma.cliente.create({ data: { nombre: "M8 producer", telefonoValido: false } });
  return prisma.lead.create({ data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: BOOTSTRAP_EMPRESA_ID, ...responsables } });
};
/**
 * Bloque C (D5): `createForActiveSupervisorsAndAdmins` (usado por
 * `assignAutomatically`) resuelve destinatarios vía `Membresia`
 * (empresaId+rol), no vía `Usuario.rol` — este helper crea la Membresia
 * activa equivalente para el único test de este archivo que ejercita ese
 * fan-out por rol ("fans an unassigned lead out...").
 */
const actorConMembresia = async (rol: "ADMINISTRADOR" | "SUPERVISOR", activo = true) => {
  const usuario = await actor(rol, activo);
  await prisma.membresia.create({
    data: { usuarioId: usuario.id, empresaId: BOOTSTRAP_EMPRESA_ID, rol, activa: true },
  });
  return usuario;
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
    const supervisor = await actorConMembresia("SUPERVISOR");
    const admin = await actorConMembresia("ADMINISTRADOR");
    const inactive = await actorConMembresia("SUPERVISOR", false);
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
    // Bloque C (D4): `deduplicateLead` en la rama `crear_lead` rechaza sin un
    // `bridgeId` resoluble — la primera llamada crea el lead, así que
    // necesita empresa; la segunda (repetición) no toca ese guard.
    sequence += 1;
    const bridge = await prisma.bridge.create({
      data: {
        redSocial: "GOOGLE_FORMS",
        nombre: `Bridge M8 repeated ${sequence}`,
        claveApiHash: hashClaveBridge(`clave-m8-repeated-${sequence}`),
        estado: "ACTIVO",
        empresaId: BOOTSTRAP_EMPRESA_ID,
      },
    });
    const first = await deduplicateLead({ nombre: "Repeated", telefono, correo: null, ingresadoEn: new Date(), bridgeId: bridge.id });
    await prisma.lead.update({ where: { id: first.leadId }, data: { asesorId: asesor.id } });
    const publish = vi.spyOn(eventBroker, "publish");
    await deduplicateLead({ nombre: "Repeated", telefono, correo: null, ingresadoEn: new Date() });
    expect(await prisma.notificacion.count({ where: { usuarioId: asesor.id, leadId: first.leadId, tipo: "INTERACCION_REPETIDA" } })).toBe(1);
    expect(publish).toHaveBeenCalledWith(asesor.id, "notificacion.nueva", expect.objectContaining({ tipo: "INTERACCION_REPETIDA" }));
  });
});
