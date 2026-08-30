import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eventBroker } from "../src/lib/event-broker.js";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { correctCasExhaustion } from "../src/services/asignacion.service.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

async function crearUsuario(nombre: string, rol: "ASESOR" | "SUPERVISOR") {
  return testAdminPrisma.usuario.create({
    data: {
      nombre,
      correo: `${nombre.toLowerCase()}-${randomUUID()}@cas.test`,
      passwordHash: "hash-no-usado",
      rol,
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

describe("asignacion.service — corrección tras agotamiento CAS", () => {
  it("registra el evento y notifica solo al actor y supervisores activos de la misma empresa", async () => {
    const [empresaA, empresaB] = await Promise.all([
      testAdminPrisma.empresa.create({ data: { nombre: `CAS A ${randomUUID()}` } }),
      testAdminPrisma.empresa.create({ data: { nombre: `CAS B ${randomUUID()}` } }),
    ]);
    const [actor, supervisorA, supervisorB, supervisorRevocado] = await Promise.all([
      crearUsuario("Actor", "ASESOR"),
      crearUsuario("Supervisor A", "SUPERVISOR"),
      crearUsuario("Supervisor B", "SUPERVISOR"),
      crearUsuario("Supervisor Revocado", "SUPERVISOR"),
    ]);
    await testAdminPrisma.membresia.createMany({
      data: [
        { usuarioId: actor.id, empresaId: empresaA.id, rol: "ASESOR" },
        { usuarioId: supervisorA.id, empresaId: empresaA.id, rol: "SUPERVISOR" },
        { usuarioId: supervisorB.id, empresaId: empresaB.id, rol: "SUPERVISOR" },
        { usuarioId: supervisorRevocado.id, empresaId: empresaA.id, rol: "SUPERVISOR", activa: false },
      ],
    });
    const cliente = await testAdminPrisma.cliente.create({
      data: { nombre: `Cliente CAS ${randomUUID()}`, telefonoValido: false },
    });
    const lead = await testAdminPrisma.lead.create({
      data: {
        clienteId: cliente.id,
        empresaId: empresaA.id,
        origen: "NUEVO",
        etapa: "NUEVO",
        ingresadoEn: new Date(),
      },
    });

    const recibidos = new Map<string, string[]>();
    const usuarios = [actor, supervisorA, supervisorB, supervisorRevocado];
    const cancelar = usuarios.map((usuario) =>
      eventBroker.subscribe(usuario.id, { sessionScope: "company", empresaId: empresaA.id }, undefined, ({ type }) => {
        const tipos = recibidos.get(usuario.id) ?? [];
        tipos.push(type);
        recibidos.set(usuario.id, tipos);
      }),
    );
    try {
      await runWithTenantContext({ empresaId: empresaA.id }, () =>
        correctCasExhaustion(lead.id, actor.id),
      );
    } finally {
      cancelar.forEach((unsubscribe) => unsubscribe());
    }

    const evento = await testAdminPrisma.leadEvento.findMany({
      where: { leadId: lead.id, tipo: "ASIGNACION_CONFLICTO" },
    });
    expect(evento).toHaveLength(1);
    expect(evento[0]).toMatchObject({ empresaId: empresaA.id, usuarioId: actor.id });

    const notificaciones = await testAdminPrisma.notificacion.findMany({
      where: { leadId: lead.id, tipo: "ASIGNACION_CONFLICTO" },
    });
    expect(new Set(notificaciones.map(({ usuarioId }) => usuarioId))).toEqual(
      new Set([actor.id, supervisorA.id]),
    );
    expect(notificaciones.every(({ empresaId }) => empresaId === empresaA.id)).toBe(true);
    expect(recibidos.get(actor.id)).toEqual(["notificacion.nueva"]);
    expect(recibidos.get(supervisorA.id)).toEqual(["notificacion.nueva"]);
    expect(recibidos.get(supervisorB.id)).toBeUndefined();
    expect(recibidos.get(supervisorRevocado.id)).toBeUndefined();
  });
});
