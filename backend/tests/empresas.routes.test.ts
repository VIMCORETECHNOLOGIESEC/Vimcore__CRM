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
    const nombre = `Empresa listado ruta ${randomUUID()}`;
    const empresa = await prisma.empresa.create({
      data: {
        nombre,
        colorPrimario: "#7c2d12",
        colorSecundario: "#f97316",
        logoUrl: "https://cdn.miempresa.com/logo.svg",
      },
    });
    const token = await loginHoldingSession("ADMINISTRADOR");

    // `search` acota la búsqueda a la Empresa recién creada -- sin esto, la
    // paginación por defecto (pageSize 25, orden por nombre) podría dejarla
    // fuera de la primera página junto a las demás filas de la BD de test.
    const respuesta = await request(app)
      .get("/api/v1/empresas")
      .query({ search: nombre })
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
    expect(Array.isArray(respuesta.body.items)).toBe(true);
    expect(typeof respuesta.body.total).toBe("number");
    expect(respuesta.body.items).toContainEqual({
      id: empresa.id,
      nombre: empresa.nombre,
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: "https://cdn.miempresa.com/logo.svg",
    });
  });

  it("no incluye campos de otros módulos (leads/usuarios/bridges)", async () => {
    const nombre = `Empresa listado shape acotado ${randomUUID()}`;
    const empresa = await prisma.empresa.create({
      data: { nombre },
    });
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .get("/api/v1/empresas")
      .query({ search: nombre })
      .set("Authorization", `Bearer ${token}`);

    const item = respuesta.body.items.find((e: { id: string }) => e.id === empresa.id);
    expect(Object.keys(item).sort()).toEqual(
      ["colorPrimario", "colorSecundario", "id", "logoUrl", "nombre"].sort(),
    );
  });

  // Gap de paginación (478 filas reales sin límite ni filtro en este
  // entorno): `page`/`pageSize` acotan la página devuelta en `items`,
  // `total` refleja el conteo completo del filtro (`search`), no el tamaño
  // de la página.
  it("pageSize acota items, total refleja el conteo completo", async () => {
    const nombreBase = `Empresa listado paginacion ${randomUUID()}`;
    await prisma.empresa.create({ data: { nombre: `${nombreBase} A` } });
    await prisma.empresa.create({ data: { nombre: `${nombreBase} B` } });
    await prisma.empresa.create({ data: { nombre: `${nombreBase} C` } });
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .get("/api/v1/empresas")
      .query({ search: nombreBase, page: 1, pageSize: 2 })
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.items).toHaveLength(2);
    expect(respuesta.body.total).toBe(3);
  });

  it("search filtra por nombre, case-insensitive", async () => {
    const marca = `MarcaBuscable${randomUUID().replace(/-/g, "")}`;
    await prisma.empresa.create({ data: { nombre: `Empresa ${marca} SA` } });
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .get("/api/v1/empresas")
      .query({ search: marca.toLowerCase() })
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(1);
    expect(respuesta.body.items[0].nombre).toContain(marca);
  });

  it("400 pageSize por encima del tope permitido", async () => {
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .get("/api/v1/empresas")
      .query({ pageSize: 101 })
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(400);
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

/**
 * `POST /empresas` (alta de empresa nueva): mismo guard/criterio de
 * autorización que `GET /empresas` de arriba -- exclusivo sessionScope
 * holding, `requireRole("ADMINISTRADOR")` + guard de `sessionScope` en el
 * controller.
 */
describe("POST /api/v1/empresas", () => {
  it("201 sesión holding crea la Empresa con el shape esperado", async () => {
    const nombre = `Empresa alta ruta ${randomUUID()}`;
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .post("/api/v1/empresas")
      .set("Authorization", `Bearer ${token}`)
      .send({ nombre, colorPrimario: "#7c2d12", colorSecundario: "#f97316" });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      nombre,
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: null,
    });
    expect(typeof respuesta.body.id).toBe("string");

    const enBd = await prisma.empresa.findUnique({ where: { id: respuesta.body.id } });
    expect(enBd?.nombre).toBe(nombre);
  });

  it("201 crea la Empresa solo con nombre (apariencia opcional)", async () => {
    const nombre = `Empresa alta minima ${randomUUID()}`;
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .post("/api/v1/empresas")
      .set("Authorization", `Bearer ${token}`)
      .send({ nombre });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual({
      id: respuesta.body.id,
      nombre,
      colorPrimario: null,
      colorSecundario: null,
      logoUrl: null,
    });
  });

  it("400 sin nombre", async () => {
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .post("/api/v1/empresas")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(respuesta.status).toBe(400);
  });

  it("403 sesión company (aunque el rol sea ADMINISTRADOR)", async () => {
    const empresaPropia = await prisma.empresa.create({
      data: { nombre: `Empresa propia empresas-alta-guard ${randomUUID()}` },
    });
    const token = await loginCompanySession(empresaPropia.id, "ADMINISTRADOR");

    const respuesta = await request(app)
      .post("/api/v1/empresas")
      .set("Authorization", `Bearer ${token}`)
      .send({ nombre: "No debería crearse" });

    expect(respuesta.status).toBe(403);
  });

  it("401 sin token de acceso", async () => {
    const respuesta = await request(app).post("/api/v1/empresas").send({ nombre: "Sin token" });

    expect(respuesta.status).toBe(401);
  });
});

/**
 * `GET /empresas/:empresaId` (pedido explícito de frontend, `EmpresaDetallePage
 * .tsx`): mismo guard/criterio de autorización que `GET /empresas`.
 */
describe("GET /api/v1/empresas/:empresaId", () => {
  it("200 sesión holding trae la Empresa puntual con el shape esperado", async () => {
    const empresa = await prisma.empresa.create({
      data: {
        nombre: `Empresa detalle ruta ${randomUUID()}`,
        colorPrimario: "#7c2d12",
        colorSecundario: "#f97316",
        logoUrl: "https://cdn.miempresa.com/logo.svg",
      },
    });
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .get(`/api/v1/empresas/${empresa.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      id: empresa.id,
      nombre: empresa.nombre,
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: "https://cdn.miempresa.com/logo.svg",
    });
  });

  it("404 empresa inexistente", async () => {
    const token = await loginHoldingSession("ADMINISTRADOR");

    const respuesta = await request(app)
      .get(`/api/v1/empresas/${randomUUID()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(404);
  });

  it("403 sesión company (aunque el rol sea ADMINISTRADOR)", async () => {
    const empresaPropia = await prisma.empresa.create({
      data: { nombre: `Empresa propia empresas-detalle-guard ${randomUUID()}` },
    });
    const token = await loginCompanySession(empresaPropia.id, "ADMINISTRADOR");

    const respuesta = await request(app)
      .get(`/api/v1/empresas/${empresaPropia.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(respuesta.status).toBe(403);
  });

  it("401 sin token de acceso", async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `Empresa detalle sin token ${randomUUID()}` },
    });

    const respuesta = await request(app).get(`/api/v1/empresas/${empresa.id}`);

    expect(respuesta.status).toBe(401);
  });
});
