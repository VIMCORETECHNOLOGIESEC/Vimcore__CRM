import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

/**
 * empresa-apariencia-holding (tema-empresarial-integracion, PASO 8): admin
 * cross-empresa, exclusivo sessionScope holding -- distinto del self-service
 * de `empresa-apariencia.routes.test.ts` (que es exactamente lo opuesto:
 * exclusivo sessionScope company sobre SU PROPIA empresa). `empresaId`
 * siempre viene del :param de la URL, nunca del body ni de la sesión.
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
      nombre: "Titular Apariencia Holding Company",
      correo: `titular-apariencia-holding-${randomUUID()}@integracion.test`,
      passwordHash: await hashPassword("clave-no-usada-apariencia-holding"),
      rol,
      activo: true,
    },
  });
  const correoMembresia = `membresia-apariencia-holding-${randomUUID()}@empresa.local`;
  const passwordMembresia = "clave-membresia-apariencia-holding-123";
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
  const correo = `holding-apariencia-holding-${randomUUID()}@integracion.test`;
  const password = "clave-holding-apariencia-holding-123";
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

describe("PATCH /api/v1/empresas/:empresaId/apariencia", () => {
  it("200 sesión holding edita nombre y colores de CUALQUIER empresa", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa gestionada ${randomUUID()}`, colorPrimario: "#111111", colorSecundario: "#222222" },
    });
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .patch(`/api/v1/empresas/${empresa.id}/apariencia`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nombre: "Nombre editado por holding", colorPrimario: "#7c2d12", colorSecundario: "#f97316" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      id: empresa.id,
      nombre: "Nombre editado por holding",
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: null,
    });

    const empresaActualizada = await prisma.empresa.findUnique({ where: { id: empresa.id } });
    expect(empresaActualizada?.nombre).toBe("Nombre editado por holding");
  });

  it("200 acepta un PATCH parcial (solo logoUrl)", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa gestionada logo ${randomUUID()}` },
    });
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .patch(`/api/v1/empresas/${empresa.id}/apariencia`)
      .set("Authorization", `Bearer ${token}`)
      .send({ logoUrl: "https://cdn.miempresa.com/logo.svg" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.logoUrl).toBe("https://cdn.miempresa.com/logo.svg");
    expect(respuesta.body.nombre).toBe(empresa.nombre);
  });

  it("403 sesión company (aunque el rol sea ADMINISTRADOR)", async () => {
    const empresaPropia = await prisma.empresa.create({
      data: { nombre: `Empresa propia holding-guard ${randomUUID()}` },
    });
    const empresaAjena = await prisma.empresa.create({
      data: { nombre: `Empresa ajena holding-guard ${randomUUID()}` },
    });
    const token = await loginCompanySession(empresaPropia.id, "ADMINISTRADOR");

    const respuesta = await request(app)
      .patch(`/api/v1/empresas/${empresaAjena.id}/apariencia`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nombre: "Intento cross-empresa" });

    expect(respuesta.status).toBe(403);

    const ajenaSinTocar = await prisma.empresa.findUnique({ where: { id: empresaAjena.id } });
    expect(ajenaSinTocar?.nombre).not.toBe("Intento cross-empresa");
  });

  it("403 rol no-ADMINISTRADOR dentro de una sesión holding", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa gestionada rol ${randomUUID()}` },
    });
    const token = await loginHoldingSession("ASESOR");

    const respuesta = await request(app)
      .patch(`/api/v1/empresas/${empresa.id}/apariencia`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nombre: "No debería aplicar" });

    expect(respuesta.status).toBe(403);
  });

  it("404 cuando la empresa del :empresaId no existe", async () => {
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .patch(`/api/v1/empresas/${randomUUID()}/apariencia`)
      .set("Authorization", `Bearer ${token}`)
      .send({ nombre: "No importa" });

    expect(respuesta.status).toBe(404);
  });

  it("400 con un :empresaId que no es un uuid válido", async () => {
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .patch("/api/v1/empresas/no-es-un-uuid/apariencia")
      .set("Authorization", `Bearer ${token}`)
      .send({ nombre: "No importa" });

    expect(respuesta.status).toBe(400);
  });

  it("400 con un body vacío (ningún campo enviado)", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa gestionada vacío ${randomUUID()}` },
    });
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .patch(`/api/v1/empresas/${empresa.id}/apariencia`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(respuesta.status).toBe(400);
  });

  it("400 con un color que no es hex de 6 dígitos", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa gestionada color inválido ${randomUUID()}` },
    });
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .patch(`/api/v1/empresas/${empresa.id}/apariencia`)
      .set("Authorization", `Bearer ${token}`)
      .send({ colorPrimario: "azul" });

    expect(respuesta.status).toBe(400);
  });

  it("401 sin token de acceso", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa gestionada sin token ${randomUUID()}` },
    });

    const respuesta = await request(app)
      .patch(`/api/v1/empresas/${empresa.id}/apariencia`)
      .send({ nombre: "No importa" });

    expect(respuesta.status).toBe(401);
  });
});
