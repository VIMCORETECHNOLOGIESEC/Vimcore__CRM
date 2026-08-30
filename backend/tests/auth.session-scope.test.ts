import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { verifyAccessToken, verifyRefreshToken } from "../src/lib/jwt.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

const app = createApp();
const PASSWORD = "clave-sesion-empresa-123456";

async function createMembershipSessionFixture() {
  const empresa = await testAdminPrisma.empresa.create({
    data: { nombre: `Empresa sesión ${crypto.randomUUID()}` },
  });
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre: "Asesora sesión",
      correo: `usuario-${crypto.randomUUID()}@sesion.test`,
      passwordHash: await hashPassword(PASSWORD),
      rol: "ASESOR",
      activo: true,
    },
  });
  const membresia = await testAdminPrisma.membresia.create({
    data: {
      usuarioId: usuario.id,
      empresaId: empresa.id,
      rol: "ASESOR",
      correo: `membresia-${crypto.randomUUID()}@sesion.test`,
      passwordHash: await hashPassword(PASSWORD),
      activa: true,
    },
  });
  return { empresa, usuario, membresia };
}

afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

describe("auth session scope", () => {
  it("revoca la familia de refresh de una membresía invalidada antes de rechazar", async () => {
    const { membresia } = await createMembershipSessionFixture();

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: membresia.correo, password: PASSWORD });
    expect(login.status).toBe(200);

    await testAdminPrisma.membresia.update({
      where: { id: membresia.id },
      data: { activa: false },
    });

    const refresh = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });

    expect(refresh.status).toBe(401);
    const tokensVigentes = await testAdminPrisma.refreshToken.count({
      where: { membresiaId: membresia.id, revocadoEn: null },
    });
    expect(tokensVigentes).toBe(0);
  });

  it("rota una sesión válida sin ampliar el scope de su membresía exacta", async () => {
    const { empresa, usuario, membresia } = await createMembershipSessionFixture();
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: membresia.correo, password: PASSWORD });
    expect(login.status).toBe(200);

    const refresh = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(200);

    const accessPayload = await verifyAccessToken(refresh.body.accessToken);
    expect(accessPayload).toMatchObject({
      sub: usuario.id,
      rol: "ASESOR",
      sessionScope: "company",
      membresiaId: membresia.id,
      empresaId: empresa.id,
    });
    const refreshPayload = await verifyRefreshToken(refresh.body.refreshToken);
    const rotatedRow = await testAdminPrisma.refreshToken.findUniqueOrThrow({
      where: { jti: refreshPayload.jti },
    });
    expect(rotatedRow).toMatchObject({
      usuarioId: usuario.id,
      membresiaId: membresia.id,
      sessionScope: "COMPANY",
      revocadoEn: null,
    });
  });

  it("impide borrar una membresía mientras existan refresh tokens vinculados", async () => {
    const { membresia } = await createMembershipSessionFixture();
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: membresia.correo, password: PASSWORD });
    expect(login.status).toBe(200);

    await expect(
      testAdminPrisma.membresia.delete({ where: { id: membresia.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
    expect(
      await testAdminPrisma.membresia.count({ where: { id: membresia.id } }),
    ).toBe(1);
  });
});
