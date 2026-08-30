import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { eventBroker } from "../src/lib/event-broker.js";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { assignAutomatically, assignLead, transferLead } from "../src/services/asignacion.service.js";
import { deduplicateLead } from "../src/services/deduplicacion.service.js";
import { transitionEtapa } from "../src/services/leads.service.js";
import type { UsuarioAcceso } from "../src/services/leads.access.js";

let sequence = 0;
const BOOTSTRAP_EMPRESA_ID = "00000000-0000-0000-0000-000000000001";
/**
 * Bloque C (Etapa 3, batch 3 discovery, D2 gap closure): estos servicios se
 * invocan DIRECTO (sin HTTP), así que sin `runWithTenantContext` cualquier
 * lectura/escritura suya sobre una tabla RLS ve 0 filas (fail-closed).
 */
function conContexto<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ empresaId: BOOTSTRAP_EMPRESA_ID }, fn);
}
// Bloque C (D2): ADMINISTRADOR/SUPERVISOR resuelven `empresaId: null`
// (holding-wide) incondicionalmente en producción (`require-authentication.middleware.ts`)
// — este helper construye el `UsuarioAcceso` a mano (sin pasar por el
// middleware) para llamar los servicios directamente, así que replica ese
// mismo criterio: ASESOR/VENDEDOR quedan acotados a la empresa bootstrap
// (misma empresa que `lead()` de abajo), Admin/Supervisor quedan `null`.
/**
 * Bloque D (batch de negociación, punto 2): el pool de asignación manual de
 * `Lead` (`asignacion.service.ts::resolveReceptor`/`selectResponsableEnEmpresa`)
 * ahora resuelve candidatos vía `Membresia`, no `Usuario.rol` — un ASESOR/
 * VENDEDOR de este archivo necesita su `Membresia` equivalente para seguir
 * siendo un candidato/destinatario válido en `assignLead`/`transferLead`.
 * Mismo mapeo de backfill que ya usa el resto del código: `VENDEDOR` legado
 * -> `Membresia(ASESOR, habilitadoParaVenta: true)`.
 */
const actor = async (rol: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "VENDEDOR", activo = true) => {
  sequence += 1;
  const user = await prisma.usuario.create({ data: { nombre: `M8 ${sequence}`, correo: `m8-${sequence}@test.local`, passwordHash: "unused", rol, activo } });
  const empresaId = rol === "ADMINISTRADOR" || rol === "SUPERVISOR" ? null : BOOTSTRAP_EMPRESA_ID;
  if (rol === "ASESOR" || rol === "VENDEDOR") {
    await testAdminPrisma.membresia.create({
      data: {
        usuarioId: user.id,
        empresaId: BOOTSTRAP_EMPRESA_ID,
        rol: "ASESOR",
        habilitadoParaVenta: rol === "VENDEDOR",
        activa: activo,
      },
    });
  }
  return { id: user.id, rol: user.rol, empresaId } satisfies UsuarioAcceso;
};
const lead = async (responsables: { asesorId?: string; vendedorId?: string } = {}) => {
  const cliente = await prisma.cliente.create({ data: { nombre: "M8 producer", telefonoValido: false } });
  return testAdminPrisma.lead.create({ data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: BOOTSTRAP_EMPRESA_ID, ...responsables } });
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
  await testAdminPrisma.membresia.create({
    data: { usuarioId: usuario.id, empresaId: BOOTSTRAP_EMPRESA_ID, rol, activa: true },
  });
  return usuario;
};

beforeEach(async () => {
  vi.restoreAllMocks();
  await testAdminPrisma.notificacion.deleteMany();
});
afterAll(() => prisma.$disconnect());

describe("M8 transactional lead producers", () => {
  it("persists assignment notification and publishes only after commit", async () => {
    const supervisor = await actor("SUPERVISOR");
    const asesor = await actor("ASESOR");
    const target = await lead();
    const publish = vi.spyOn(eventBroker, "publish");
    await conContexto(() => assignLead(supervisor, target.id, { asesorId: asesor.id }));
    expect(await testAdminPrisma.notificacion.count({ where: { usuarioId: asesor.id, leadId: target.id, tipo: "LEAD_ASIGNADO" } })).toBe(1);
    expect(publish).toHaveBeenCalledWith(asesor.id, "notificacion.nueva", expect.objectContaining({ tipo: "LEAD_ASIGNADO" }), BOOTSTRAP_EMPRESA_ID);
    expect(publish).toHaveBeenCalledWith(asesor.id, "lead.asignado", expect.objectContaining({ leadId: target.id }), BOOTSTRAP_EMPRESA_ID);
  });

  it("rolls back assignment notification and stays silent when the transaction fails", async () => {
    const supervisor = await actor("SUPERVISOR");
    const asesor = await actor("ASESOR");
    const target = await lead();
    const publish = vi.spyOn(eventBroker, "publish");
    await prisma.usuario.delete({ where: { id: supervisor.id } });
    await expect(conContexto(() => assignLead(supervisor, target.id, { asesorId: asesor.id }))).rejects.toThrow();
    expect(await testAdminPrisma.notificacion.count({ where: { leadId: target.id } })).toBe(0);
    expect(publish).not.toHaveBeenCalled();
  });

  it("notifies transfer recipient and emits stage changes without creating a notification", async () => {
    const supervisor = await actor("SUPERVISOR");
    const asesor = await actor("ASESOR");
    const vendedor = await actor("VENDEDOR");
    const target = await lead({ asesorId: asesor.id });
    await testAdminPrisma.lead.update({ where: { id: target.id }, data: { etapa: "CONTACTADO" } });
    const publish = vi.spyOn(eventBroker, "publish");
    await conContexto(() => transferLead(supervisor, target.id, { vendedorId: vendedor.id }));
    const beforeStage = await testAdminPrisma.notificacion.count({ where: { leadId: target.id } });
    // Bloque D (batch de negociación, decisión documentada, RETIRADO):
    // `transitionEtapa` ya no acepta VENTA/NO_VENTA — cerrar una negociación
    // ahora vive exclusivamente en `POST /oportunidades/:id/cerrar`
    // (`leads.service.ts::transitionEtapa`, rama VENTA/NO_VENTA lanza
    // "cierre_via_oportunidad"). Este test no ejercita el cierre: solo
    // verifica que un cambio de etapa NO-terminal (CONTACTADO -> CITA) emite
    // su evento sin crear una notificación nueva — la transición vendedor,
    // ya responsable operativo tras el traspaso de arriba, la ejecuta.
    await conContexto(() =>
      transitionEtapa(vendedor, target.id, { etapa: "CITA", respuestas: {} }),
    );
    expect(await testAdminPrisma.notificacion.count({ where: { usuarioId: vendedor.id, leadId: target.id, tipo: "LEAD_TRASPASADO" } })).toBe(1);
    expect(await testAdminPrisma.notificacion.count({ where: { leadId: target.id } })).toBe(beforeStage);
    expect(publish).toHaveBeenCalledWith(vendedor.id, "lead.etapa-cambiada", expect.objectContaining({ etapaNueva: "CITA" }), BOOTSTRAP_EMPRESA_ID);
  });

  it("fans an unassigned lead out only to active supervisors and administrators", async () => {
    // Bloque D (batch de negociación, punto 2/3): `assignAutomatically` ahora
    // resuelve el pool ASESOR vía `Membresia`, no `Usuario.rol` — un actor
    // VENDEDOR creado por un test ANTERIOR de este mismo archivo ("notifies
    // transfer recipient...") sigue teniendo `Membresia(rol: ASESOR,
    // habilitadoParaVenta: true, activa: true)`, así que desactivar solo
    // `Usuario.rol: "ASESOR"` no lo excluye y el lead terminaría asignado en
    // vez de quedar "sin candidatos" (0 notificaciones LEAD_SIN_ASIGNAR).
    await prisma.usuario.updateMany({ where: { rol: { in: ["ASESOR", "VENDEDOR"] } }, data: { activo: false } });
    await testAdminPrisma.membresia.updateMany({ where: { empresaId: BOOTSTRAP_EMPRESA_ID, rol: "ASESOR" }, data: { activa: false } });
    const supervisor = await actorConMembresia("SUPERVISOR");
    const admin = await actorConMembresia("ADMINISTRADOR");
    const inactive = await actorConMembresia("SUPERVISOR", false);
    const target = await lead();
    await conContexto(() => prisma.$transaction((tx) => assignAutomatically(target.id, new Date(), tx)));
    const recipients = await testAdminPrisma.notificacion.findMany({ where: { leadId: target.id, tipo: "LEAD_SIN_ASIGNAR" }, select: { usuarioId: true } });
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
    const bridge = await testAdminPrisma.bridge.create({
      data: {
        redSocial: "GOOGLE_FORMS",
        nombre: `Bridge M8 repeated ${sequence}`,
        claveApiHash: hashClaveBridge(`clave-m8-repeated-${sequence}`),
        estado: "ACTIVO",
        empresaId: BOOTSTRAP_EMPRESA_ID,
      },
    });
    const first = await conContexto(() =>
      deduplicateLead({ nombre: "Repeated", telefono, correo: null, ingresadoEn: new Date(), bridgeId: bridge.id }),
    );
    await testAdminPrisma.lead.update({ where: { id: first.leadId }, data: { asesorId: asesor.id } });
    const publish = vi.spyOn(eventBroker, "publish");
    await conContexto(() => deduplicateLead({ nombre: "Repeated", telefono, correo: null, ingresadoEn: new Date() }));
    expect(await testAdminPrisma.notificacion.count({ where: { usuarioId: asesor.id, leadId: first.leadId, tipo: "INTERACCION_REPETIDA" } })).toBe(1);
    expect(publish).toHaveBeenCalledWith(asesor.id, "notificacion.nueva", expect.objectContaining({ tipo: "INTERACCION_REPETIDA" }), BOOTSTRAP_EMPRESA_ID);
  });
});
