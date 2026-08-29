import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const ADMIN_PASSWORD = "clave-admin-config-123456";
const VENDEDOR_PASSWORD = "clave-vendedor-config-1234";

let adminAccessToken: string;
let vendedorAccessToken: string;

beforeAll(async () => {
  // Mismo criterio que `configuracion-empresa.service.test.ts`: no depender
  // del orden de ejecución entre archivos de test para la tabla singleton.
  await prisma.configuracionEmpresa.deleteMany();

  await prisma.usuario.create({
    data: {
      nombre: "Admin Config Empresa",
      correo: "admin-config-empresa@integracion.test",
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      rol: "ADMINISTRADOR",
      activo: true,
    },
  });

  await prisma.usuario.create({
    data: {
      nombre: "Vendedor Config Empresa",
      correo: "vendedor-config-empresa@integracion.test",
      passwordHash: await hashPassword(VENDEDOR_PASSWORD),
      rol: "VENDEDOR",
      activo: true,
    },
  });

  const adminLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: "admin-config-empresa@integracion.test", password: ADMIN_PASSWORD });
  adminAccessToken = adminLogin.body.accessToken;

  const vendedorLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: "vendedor-config-empresa@integracion.test", password: VENDEDOR_PASSWORD });
  vendedorAccessToken = vendedorLogin.body.accessToken;
});

afterAll(async () => {
  // Aislamiento entre archivos de test (`configuracion_empresa` es una tabla
  // singleton compartida por toda la suite, a diferencia de `usuarios`/`leads`
  // donde cada fila es distinguible por su propio id/correo): sin esta
  // limpieza, la fila que este archivo crea/modifica vía PATCH quedaría
  // filtrada hacia `configuracion-empresa.service.test.ts`, que asume una
  // tabla vacía en su caso de "lazy init sin fila previa".
  await prisma.configuracionEmpresa.deleteMany();
  await prisma.$disconnect();
});

describe("GET /api/v1/configuracion-empresa", () => {
  it("200 cualquier usuario autenticado (sin restricción de rol) recibe {nombre,colorPrimario,colorSecundario}", async () => {
    const respuesta = await request(app)
      .get("/api/v1/configuracion-empresa")
      .set("Authorization", `Bearer ${vendedorAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      nombre: expect.any(String),
      colorPrimario: expect.stringMatching(/^#[0-9a-fA-F]{6}$/),
      colorSecundario: expect.stringMatching(/^#[0-9a-fA-F]{6}$/),
    });
  });

  it("401 sin token de acceso", async () => {
    const respuesta = await request(app).get("/api/v1/configuracion-empresa");
    expect(respuesta.status).toBe(401);
  });
});

describe("PATCH /api/v1/configuracion-empresa", () => {
  it("200 ADMINISTRADOR actualiza nombre y colores", async () => {
    const respuesta = await request(app)
      .patch("/api/v1/configuracion-empresa")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Mi Empresa S.A.", colorPrimario: "#ff0000", colorSecundario: "#00ff00" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      nombre: "Mi Empresa S.A.",
      colorPrimario: "#ff0000",
      colorSecundario: "#00ff00",
    });

    const siguienteGet = await request(app)
      .get("/api/v1/configuracion-empresa")
      .set("Authorization", `Bearer ${adminAccessToken}`);
    expect(siguienteGet.body).toEqual({
      nombre: "Mi Empresa S.A.",
      colorPrimario: "#ff0000",
      colorSecundario: "#00ff00",
    });
  });

  it("403 cuando un VENDEDOR intenta editar la configuración", async () => {
    const respuesta = await request(app)
      .patch("/api/v1/configuracion-empresa")
      .set("Authorization", `Bearer ${vendedorAccessToken}`)
      .send({ nombre: "No Debería Cambiar" });

    expect(respuesta.status).toBe(403);
  });

  it("401 sin token de acceso", async () => {
    const respuesta = await request(app)
      .patch("/api/v1/configuracion-empresa")
      .send({ nombre: "Sin Token" });

    expect(respuesta.status).toBe(401);
  });

  it("400 con un color que no es hex de 6 dígitos", async () => {
    const respuesta = await request(app)
      .patch("/api/v1/configuracion-empresa")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ colorPrimario: "azul" });

    expect(respuesta.status).toBe(400);
  });

  it("400 con nombre vacío", async () => {
    const respuesta = await request(app)
      .patch("/api/v1/configuracion-empresa")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "" });

    expect(respuesta.status).toBe(400);
  });

  it("400 con body vacío (sin campos)", async () => {
    const respuesta = await request(app)
      .patch("/api/v1/configuracion-empresa")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({});

    expect(respuesta.status).toBe(400);
  });
});
