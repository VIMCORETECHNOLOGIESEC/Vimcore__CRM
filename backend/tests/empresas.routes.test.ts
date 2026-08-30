import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

/**
 * GET /empresas (tema-empresarial-integracion, PASO 8 -- gap detectado
 * durante la implementación de la pantalla "gestor de empresas"): listado
 * exclusivo sessionScope holding, mismo guard/criterio de autorización que
 * `PATCH /empresas/:empresaId/apariencia` (empresa-apariencia-holding.routes
 * .test.ts) -- reusa `forbiddenSessionScope` en el controller, no un guard nuevo.
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
      nombre: "Titular Empresas Listado Company",
      correo: `titular-empresas-listado-${randomUUID()}@integracion.test`,
      passwordHash: await hashPassword("clave-no-usada-empresas-listado"),
      rol,
      activo: true,
    },
  });
  const correoMembresia = `membresia-empresas-listado-${randomUUID()}@empresa.local`;
  const passwordMembresia = "clave-membresia-empresas-listado-123";
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

async function loginHoldingSession(rol: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" = "ADMINISTRADOR") {
  const correo = `holding-empresas-listado-${randomUUID()}@integracion.test`;
  const password = "clave-holding-empresas-listado-123";
  await prisma.usuario.create({
    data: {
      nombre: "Titular Empresas Listado Holding",
      correo,
      passwordHash: await hashPassword(password),
      rol,
      activo: true,
    },
  });

  const login = await request(app).post("/api/v1/auth/login").send({ correo, password });
  return login.body.accessToken as string;
}

describe("GET /api/v1/empresas", () => {
  it("200 sesión holding lista Empresa de la instancia con el shape esperado", async () => {
    const empresa = await prisma.empresa.create({
      data: {
        nombre: `Empresa listado ruta ${randomUUID()}`,
        colorPrimario: "#7c2d12",
        colorSecundario: "#f97316",
        logoUrl: "https://cdn.miempresa.com/logo.svg",
      },
    });
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .get("/api/v1/empresas")
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
    expect(Array.isArray(respuesta.body)).toBe(true);
    expect(respuesta.body).toContainEqual({
      id: empresa.id,
      nombre: empresa.nombre,
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: "https://cdn.miempresa.com/logo.svg",
    });
  });

  it("no incluye campos de otros módulos (leads/usuarios/bridges)", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa listado shape acotado ${randomUUID()}` },
    });
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .get("/api/v1/empresas")
      .set("Authorization", `Bearer ${token}`);

    const item = respuesta.body.find((e: { id: string }) => e.id === empresa.id);
    expect(Object.keys(item).sort()).toEqual(
      ["colorPrimario", "colorSecundario", "id", "logoUrl", "nombre"].sort(),
    );
  });

  it("403 sesión company (aunque el rol sea ADMINISTRADOR)", async () => {
    const empresaPropia = await prisma.empresa.create({
      data: { nombre: `Empresa propia empresas-listado-guard ${randomUUID()}` },
    });
    const token = await loginCompanySession(empresaPropia.id, "ADMINISTRADOR");

    const respuesta = await request(app)
      .get("/api/v1/empresas")
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(403);
  });

  it("403 rol no-ADMINISTRADOR dentro de una sesión holding", async () => {
    const token = await loginHoldingSession("ASESOR");

    const respuesta = await request(app)
      .get("/api/v1/empresas")
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(403);
  });

  it("401 sin token de acceso", async () => {
    const respuesta = await request(app).get("/api/v1/empresas");

    expect(respuesta.status).toBe(401);
  });
});
