import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

/**
 * empresa-apariencia (tema-empresarial-integracion, Tarea 3): endpoint
 * self-service para que el ADMINISTRADOR de UNA empresa restaure/edite el
 * color propio de SU empresa (`Empresa.colorPrimario/colorSecundario`) --
 * jamás un `empresaId` que venga del cliente, siempre el de la sesión
 * (`req.user.empresaId`, resuelto por `requireAuthentication`).
 */
const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

async function loginCompanySession(
  empresaId: string,
  rol: "ADMINISTRADOR" | "ASESOR" = "ADMINISTRADOR",
) {
  const usuario = await prisma.usuario.create({
    data: {
      nombre: "Titular Apariencia Empresa",
      correo: `titular-apariencia-${randomUUID()}@integracion.test`,
      passwordHash: await hashPassword("clave-no-usada-apariencia"),
      rol,
      activo: true,
    },
  });
  const correoMembresia = `membresia-apariencia-${randomUUID()}@empresa.local`;
  const passwordMembresia = "clave-membresia-apariencia-123";
  await testAdminPrisma.membresia.create({
    data: {
      usuarioId: usuario.id,
      empresaId,
      rol,
      correo: correoMembresia,
      passwordHash: await hashPassword(passwordMembresia),
      activa: true,
    },
  });

  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: correoMembresia, password: passwordMembresia });
  return login.body.accessToken as string;
}

async function loginHoldingSession(rol: "ADMINISTRADOR" | "ASESOR" = "ADMINISTRADOR") {
  const correo = `holding-apariencia-${randomUUID()}@integracion.test`;
  const password = "clave-holding-apariencia-123";
  await prisma.usuario.create({
    data: {
      nombre: "Titular Apariencia Holding",
      correo,
      passwordHash: await hashPassword(password),
      rol,
      activo: true,
    },
  });

  const login = await request(app).post("/api/v1/auth/login").send({ correo, password });
  return login.body.accessToken as string;
}

describe("PATCH /api/v1/empresas/actual/apariencia", () => {
  it("200 ADMINISTRADOR de empresa restaura su propio color a null", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa apariencia ${randomUUID()}`, colorPrimario: "#7c2d12", colorSecundario: "#f97316" },
    });
    const token = await loginCompanySession(empresa.id);

    const respuesta = await request(app)
      .patch("/api/v1/empresas/actual/apariencia")
      .set("Authorization", `Bearer ${token}`)
      .send({ colorPrimario: null, colorSecundario: null });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ colorPrimario: null, colorSecundario: null });

    const empresaActualizada = await prisma.empresa.findUnique({ where: { id: empresa.id } });
    expect(empresaActualizada?.colorPrimario).toBeNull();
    expect(empresaActualizada?.colorSecundario).toBeNull();
  });

  it("200 ADMINISTRADOR de empresa setea un color hex válido", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa apariencia ${randomUUID()}` },
    });
    const token = await loginCompanySession(empresa.id);

    const respuesta = await request(app)
      .patch("/api/v1/empresas/actual/apariencia")
      .set("Authorization", `Bearer ${token}`)
      .send({ colorPrimario: "#123456", colorSecundario: "#abcdef" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ colorPrimario: "#123456", colorSecundario: "#abcdef" });
  });

  it("ignora por completo un empresaId enviado en el body -- usa siempre el de la sesión", async () => {
    const empresaPropia = await prisma.empresa.create({
      data: { nombre: `Empresa propia ${randomUUID()}`, colorPrimario: "#111111", colorSecundario: "#222222" },
    });
    const empresaAjena = await prisma.empresa.create({
      data: { nombre: `Empresa ajena ${randomUUID()}`, colorPrimario: "#333333", colorSecundario: "#444444" },
    });
    const token = await loginCompanySession(empresaPropia.id);

    const respuesta = await request(app)
      .patch("/api/v1/empresas/actual/apariencia")
      .set("Authorization", `Bearer ${token}`)
      .send({ empresaId: empresaAjena.id, colorPrimario: null, colorSecundario: null });

    expect(respuesta.status).toBe(200);

    const propiaActualizada = await prisma.empresa.findUnique({ where: { id: empresaPropia.id } });
    expect(propiaActualizada?.colorPrimario).toBeNull();

    const ajenaSinTocar = await prisma.empresa.findUnique({ where: { id: empresaAjena.id } });
    expect(ajenaSinTocar?.colorPrimario).toBe("#333333");
  });

  it("403 sesión holding (aunque el rol sea ADMINISTRADOR)", async () => {
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .patch("/api/v1/empresas/actual/apariencia")
      .set("Authorization", `Bearer ${token}`)
      .send({ colorPrimario: null, colorSecundario: null });

    expect(respuesta.status).toBe(403);
  });

  it("403 rol no-ADMINISTRADOR dentro de una sesión company", async () => {
    const empresa = await prisma.empresa.create({ data: { nombre: `Empresa apariencia ${randomUUID()}` } });
    const token = await loginCompanySession(empresa.id, "ASESOR");

    const respuesta = await request(app)
      .patch("/api/v1/empresas/actual/apariencia")
      .set("Authorization", `Bearer ${token}`)
      .send({ colorPrimario: null, colorSecundario: null });

    expect(respuesta.status).toBe(403);
  });

  it("400 con un color que no es hex de 6 dígitos", async () => {
    const empresa = await prisma.empresa.create({ data: { nombre: `Empresa apariencia ${randomUUID()}` } });
    const token = await loginCompanySession(empresa.id);

    const respuesta = await request(app)
      .patch("/api/v1/empresas/actual/apariencia")
      .set("Authorization", `Bearer ${token}`)
      .send({ colorPrimario: "azul", colorSecundario: null });

    expect(respuesta.status).toBe(400);
  });

  it("400 cuando falta un campo requerido del body", async () => {
    const empresa = await prisma.empresa.create({ data: { nombre: `Empresa apariencia ${randomUUID()}` } });
    const token = await loginCompanySession(empresa.id);

    const respuesta = await request(app)
      .patch("/api/v1/empresas/actual/apariencia")
      .set("Authorization", `Bearer ${token}`)
      .send({ colorPrimario: null });

    expect(respuesta.status).toBe(400);
  });

  it("401 sin token de acceso", async () => {
    const respuesta = await request(app)
      .patch("/api/v1/empresas/actual/apariencia")
      .send({ colorPrimario: null, colorSecundario: null });

    expect(respuesta.status).toBe(401);
  });
});
