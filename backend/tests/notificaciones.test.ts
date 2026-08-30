import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { createForActiveSupervisorsAndAdmins } from "../src/services/notificaciones.service.js";
const app = createApp();
const password = "clave-notificaciones-123456";
let ownerId: string;
let foreignId: string;
let ownerToken: string;
async function createUser(role: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR", active = true) {
  return prisma.usuario.create({
    data: {
      nombre: `Notificaciones ${role}`,
      correo: `notificaciones-${role.toLowerCase()}-${crypto.randomUUID()}@test.local`,
      passwordHash: await hashPassword(password),
      rol: role,
      activo: active,
    },
  });
}
const BOOTSTRAP_EMPRESA_ID = "00000000-0000-0000-0000-000000000001";
/**
 * Bloque C (D5): `createForActiveSupervisorsAndAdmins` ahora resuelve
 * destinatarios vía `Membresia` (empresaId+rol), no vía un scan global de
 * `Usuario.rol` — este helper crea la Membresia activa equivalente para que
 * estas pruebas sigan ejerciendo la resolución real de destinatarios.
 */
async function createUserConMembresia(role: "ADMINISTRADOR" | "SUPERVISOR", active = true) {
  const usuario = await createUser(role, active);
  await testAdminPrisma.membresia.create({
    data: { usuarioId: usuario.id, empresaId: BOOTSTRAP_EMPRESA_ID, rol: role, activa: true },
  });
  return usuario;
}
async function login(correo: string): Promise<string> {
  const response = await request(app).post("/api/v1/auth/login").send({ correo, password });
  expect(response.status).toBe(200);
  return response.body.accessToken as string;
}
beforeAll(async () => {
  const owner = await createUser("ASESOR");
  const foreign = await createUser("ASESOR");
  ownerId = owner.id;
  foreignId = foreign.id;
  // Bloque C follow-up (D2 gap closure): `owner` se loguea y hace peticiones
  // autenticadas en las pruebas de abajo — sin Membresia activa,
  // `requireAuthentication` rechazaría el TenantContext (D2). `foreign` solo
  // se usa como id de referencia, nunca se autentica — no la necesita.
  await testAdminPrisma.membresia.create({
    data: { usuarioId: owner.id, empresaId: BOOTSTRAP_EMPRESA_ID, rol: "ASESOR", activa: true },
  });
  ownerToken = await login(owner.correo);
});
beforeEach(async () => {
  await testAdminPrisma.notificacion.deleteMany();
});
afterAll(async () => {
  await prisma.$disconnect();
});
describe("M8 notification REST API", () => {
  it("lists only the authenticated owner's unread notifications newest first", async () => {
    const oldest = await testAdminPrisma.notificacion.create({
      data: {
        usuarioId: ownerId,
        tipo: "LEAD_ASIGNADO",
        canal: "IN_APP",
        titulo: "Oldest",
        mensaje: "First message",
        creadaEn: new Date("2026-01-01T10:00:00Z"),
      },
    });
    const newest = await testAdminPrisma.notificacion.create({
      data: {
        usuarioId: ownerId,
        tipo: "LEAD_TRASPASADO",
        canal: "IN_APP",
        titulo: "Newest",
        mensaje: "Second message",
        creadaEn: new Date("2026-01-01T11:00:00Z"),
      },
    });
    await testAdminPrisma.notificacion.create({
      data: {
        usuarioId: ownerId,
        tipo: "LEAD_SIN_ATENDER",
        canal: "IN_APP",
        titulo: "Read",
        mensaje: "Already read",
        leidaEn: new Date(),
      },
    });
    await testAdminPrisma.notificacion.create({
      data: {
        usuarioId: foreignId,
        tipo: "LEAD_ASIGNADO",
        canal: "IN_APP",
        titulo: "Foreign",
        mensaje: "Must stay private",
      },
    });
    const response = await request(app)
      .get("/api/v1/notificaciones?soloNoLeidas=true")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(response.status).toBe(200);
    expect(response.body.notificaciones.map((item: { id: string }) => item.id)).toEqual([
      newest.id,
      oldest.id,
    ]);
  });
  it("marks an owned notification idempotently and rejects foreign or missing IDs", async () => {
    const owned = await testAdminPrisma.notificacion.create({
      data: {
        usuarioId: ownerId,
        tipo: "RECORDATORIO_CITA",
        canal: "IN_APP",
        titulo: "Appointment",
        mensaje: "Upcoming appointment",
      },
    });
    const foreign = await testAdminPrisma.notificacion.create({
      data: {
        usuarioId: foreignId,
        tipo: "ERROR_BRIDGE",
        canal: "IN_APP",
        titulo: "Bridge",
        mensaje: "Foreign alert",
      },
    });
    for (const attempt of [1, 2]) {
      const response = await request(app)
        .patch(`/api/v1/notificaciones/${owned.id}/leer`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(response.status, `attempt ${attempt}`).toBe(204);
    }
    const foreignResponse = await request(app)
      .patch(`/api/v1/notificaciones/${foreign.id}/leer`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const missingResponse = await request(app)
      .patch(`/api/v1/notificaciones/${crypto.randomUUID()}/leer`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(foreignResponse.status).toBe(404);
    expect(missingResponse.status).toBe(404);
    expect((await testAdminPrisma.notificacion.findUniqueOrThrow({ where: { id: foreign.id } })).leidaEn).toBeNull();
  });
  it("marks all and only the owner's notifications read with repeatable 204 responses", async () => {
    await testAdminPrisma.notificacion.createMany({
      data: [
        { usuarioId: ownerId, tipo: "LEAD_ASIGNADO", canal: "IN_APP", titulo: "A", mensaje: "A" },
        { usuarioId: ownerId, tipo: "LEAD_TRASPASADO", canal: "IN_APP", titulo: "B", mensaje: "B" },
        { usuarioId: foreignId, tipo: "ERROR_BRIDGE", canal: "IN_APP", titulo: "C", mensaje: "C" },
      ],
    });
    for (const attempt of [1, 2]) {
      const response = await request(app)
        .patch("/api/v1/notificaciones/leer-todas")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(response.status, `attempt ${attempt}`).toBe(204);
    }
    expect(await testAdminPrisma.notificacion.count({ where: { usuarioId: ownerId, leidaEn: null } })).toBe(0);
    expect(await testAdminPrisma.notificacion.count({ where: { usuarioId: foreignId, leidaEn: null } })).toBe(1);
  });
});
describe("M8 active supervisor/admin fan-out", () => {
  it("creates alerts for every active supervisor/admin and excludes inactive users", async () => {
    const activeSupervisor = await createUserConMembresia("SUPERVISOR");
    const activeAdmin = await createUserConMembresia("ADMINISTRADOR");
    const inactiveSupervisor = await createUserConMembresia("SUPERVISOR", false);
    await createForActiveSupervisorsAndAdmins(
      {
        tipo: "LEAD_SIN_ASIGNAR",
        titulo: "Lead sin asignar",
        mensaje: "No hay responsables disponibles",
      },
      BOOTSTRAP_EMPRESA_ID,
      testAdminPrisma,
    );
    const recipients = await testAdminPrisma.notificacion.findMany({
      where: { tipo: "LEAD_SIN_ASIGNAR" },
      select: { usuarioId: true },
    });
    const ids = recipients.map(({ usuarioId }) => usuarioId);
    expect(ids).toContain(activeSupervisor.id);
    expect(ids).toContain(activeAdmin.id);
    expect(ids).not.toContain(inactiveSupervisor.id);
  });
  it("rolls back every fan-out notification when its transaction fails", async () => {
    await createUserConMembresia("SUPERVISOR");
    await expect(
      testAdminPrisma.$transaction(async (tx) => {
        await createForActiveSupervisorsAndAdmins(
          {
            tipo: "LEAD_SIN_ASIGNAR",
            titulo: "Lead sin asignar",
            mensaje: "Rollback expected",
          },
          BOOTSTRAP_EMPRESA_ID,
          tx,
        );
        throw new Error("forced rollback");
      }),
    ).rejects.toThrow("forced rollback");
    expect(await testAdminPrisma.notificacion.count()).toBe(0);
  });
});
