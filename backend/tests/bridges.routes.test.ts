import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const ADMIN_PASSWORD = "clave-admin-bridges-123456";
const VENDEDOR_PASSWORD = "clave-vendedor-bridges-1234";

let adminAccessToken: string;
let vendedorAccessToken: string;
let contador = 0;

function claveApiUnica(): string {
  contador += 1;
  return `clave-api-rutas-${contador}`;
}

async function crearBridgeDirecto(
  overrides: Partial<{ estado: "ACTIVO" | "INACTIVO" }> = {},
): Promise<{ id: string }> {
  contador += 1;
  const bridge = await prisma.bridge.create({
    data: {
      redSocial: "GOOGLE_FORMS",
      nombre: `Bridge ruta ${contador}`,
      claveApiHash: hashClaveBridge(claveApiUnica()),
      estado: overrides.estado ?? "ACTIVO",
    },
  });
  return { id: bridge.id };
}

beforeAll(async () => {
  await prisma.usuario.create({
    data: {
      nombre: "Admin Bridges",
      correo: "admin-bridges@integracion.test",
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      rol: "ADMINISTRADOR",
      activo: true,
    },
  });
  await prisma.usuario.create({
    data: {
      nombre: "Vendedor Bridges",
      correo: "vendedor-bridges@integracion.test",
      passwordHash: await hashPassword(VENDEDOR_PASSWORD),
      rol: "VENDEDOR",
      activo: true,
    },
  });

  const adminLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: "admin-bridges@integracion.test", password: ADMIN_PASSWORD });
  adminAccessToken = adminLogin.body.accessToken;

  const vendedorLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: "vendedor-bridges@integracion.test", password: VENDEDOR_PASSWORD });
  vendedorAccessToken = vendedorLogin.body.accessToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/bridges (Requirement: Bridge creation starts inactive with one-time plaintext key)", () => {
  it("201 crea el bridge INACTIVO y devuelve la clave en claro", async () => {
    const respuesta = await request(app)
      .post("/api/v1/bridges")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ redSocial: "FACEBOOK", nombre: "Bridge Facebook Rutas" });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.bridge.estado).toBe("INACTIVO");
    expect(typeof respuesta.body.claveApi).toBe("string");
    expect(respuesta.body.claveApi.startsWith("brg_")).toBe(true);
    expect(respuesta.body.bridge.claveApiHash).toBeUndefined();
  });

  it("400 con un redSocial fuera del enum", async () => {
    const respuesta = await request(app)
      .post("/api/v1/bridges")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ redSocial: "TIKTOK", nombre: "Bridge Inválido" });

    expect(respuesta.status).toBe(400);
  });

  it("400 con campos faltantes", async () => {
    const respuesta = await request(app)
      .post("/api/v1/bridges")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Sin redSocial" });

    expect(respuesta.status).toBe(400);
  });
});

describe("GET /api/v1/bridges y GET /api/v1/bridges/:id", () => {
  it("200 lista bridges sin exponer claveApiHash", async () => {
    await crearBridgeDirecto();

    const respuesta = await request(app)
      .get("/api/v1/bridges")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(Array.isArray(respuesta.body.bridges)).toBe(true);
    for (const bridge of respuesta.body.bridges) {
      expect(bridge.claveApiHash).toBeUndefined();
    }
  });

  it("200 obtiene un bridge por id, incluye cuentasPublicitarias y nunca expone claveApiHash", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .get(`/api/v1/bridges/${id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.bridge.id).toBe(id);
    expect(respuesta.body.bridge.claveApiHash).toBeUndefined();
    expect(Array.isArray(respuesta.body.bridge.cuentasPublicitarias)).toBe(true);
  });

  it("404 con un id que no existe", async () => {
    const respuesta = await request(app)
      .get("/api/v1/bridges/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(404);
  });

  it("400 con un id que no es UUID", async () => {
    const respuesta = await request(app)
      .get("/api/v1/bridges/no-es-un-uuid")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(400);
  });
});

describe("PATCH /api/v1/bridges/:id (Requirement: PATCH /bridges/:id es el único endpoint)", () => {
  it("200 renombra sin cambiar estado", async () => {
    const { id } = await crearBridgeDirecto({ estado: "ACTIVO" });

    const respuesta = await request(app)
      .patch(`/api/v1/bridges/${id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Renombrado por PATCH" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.bridge.nombre).toBe("Renombrado por PATCH");
    expect(respuesta.body.bridge.estado).toBe("ACTIVO");
  });

  it("200 activa/desactiva por el mismo endpoint", async () => {
    const { id } = await crearBridgeDirecto({ estado: "ACTIVO" });

    const respuesta = await request(app)
      .patch(`/api/v1/bridges/${id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ estado: "INACTIVO" });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.bridge.estado).toBe("INACTIVO");
  });

  it("400 con un estado fuera del whitelist (TOKEN_EXPIRADO es system-authored)", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .patch(`/api/v1/bridges/${id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ estado: "TOKEN_EXPIRADO" });

    expect(respuesta.status).toBe(400);
  });

  it("400 con un body vacío (sin campos)", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .patch(`/api/v1/bridges/${id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({});

    expect(respuesta.status).toBe(400);
  });

  it("404 con un id que no existe", async () => {
    const respuesta = await request(app)
      .patch("/api/v1/bridges/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminAccessToken}`)
      .send({ nombre: "Fantasma" });

    expect(respuesta.status).toBe(404);
  });
});

describe("DELETE /api/v1/bridges/:id (Requirement: Delete mode is decided by lead count, never ultimoLeadEn)", () => {
  it("200 BAJA_FISICA cuando leadsRecibidos.count === 0", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .delete(`/api/v1/bridges/${id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.resultado).toBe("BAJA_FISICA");

    const filaTrasBorrado = await prisma.bridge.findUnique({ where: { id } });
    expect(filaTrasBorrado).toBeNull();
  });

  it("200 BAJA_LOGICA cuando leadsRecibidos.count > 0", async () => {
    const { id } = await crearBridgeDirecto({ estado: "ACTIVO" });
    await prisma.leadRecibido.create({
      data: {
        bridgeId: id,
        idExternoLead: `lead-externo-ruta-${contador}`,
        payload: {},
        entradaProcesamiento: {},
      },
    });

    const respuesta = await request(app)
      .delete(`/api/v1/bridges/${id}`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.resultado).toBe("BAJA_LOGICA");

    const filaTrasBaja = await prisma.bridge.findUniqueOrThrow({ where: { id } });
    expect(filaTrasBaja.estado).toBe("INACTIVO");
  });

  it("404 con un id que no existe", async () => {
    const respuesta = await request(app)
      .delete("/api/v1/bridges/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(404);
  });
});

describe("POST /api/v1/bridges/:id/clave (Requirement: Key regeneration never changes bridge state)", () => {
  it("200 emite una clave nueva en claro y deja el estado intacto", async () => {
    const { id } = await crearBridgeDirecto({ estado: "ACTIVO" });

    const respuesta = await request(app)
      .post(`/api/v1/bridges/${id}/clave`)
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.claveApi.startsWith("brg_")).toBe(true);
    expect(respuesta.body.bridge.estado).toBe("ACTIVO");
    expect(respuesta.body.bridge.claveApiHash).toBeUndefined();
  });

  it("404 con un id que no existe", async () => {
    const respuesta = await request(app)
      .post("/api/v1/bridges/00000000-0000-0000-0000-000000000000/clave")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(respuesta.status).toBe(404);
  });
});

describe("Matriz de roles — solo ADMINISTRADOR opera /bridges (Requirement: Every /bridges endpoint requires authenticated ADMINISTRADOR)", () => {
  it("403 cuando un VENDEDOR intenta listar bridges", async () => {
    const respuesta = await request(app)
      .get("/api/v1/bridges")
      .set("Authorization", `Bearer ${vendedorAccessToken}`);

    expect(respuesta.status).toBe(403);
  });

  it("403 cuando un VENDEDOR intenta crear un bridge", async () => {
    const respuesta = await request(app)
      .post("/api/v1/bridges")
      .set("Authorization", `Bearer ${vendedorAccessToken}`)
      .send({ redSocial: "FACEBOOK", nombre: "No debería crearse" });

    expect(respuesta.status).toBe(403);
  });

  it("403 cuando un VENDEDOR intenta regenerar la clave", async () => {
    const { id } = await crearBridgeDirecto();

    const respuesta = await request(app)
      .post(`/api/v1/bridges/${id}/clave`)
      .set("Authorization", `Bearer ${vendedorAccessToken}`);

    expect(respuesta.status).toBe(403);
  });

  it("401 sin token de acceso en cualquier endpoint de /bridges", async () => {
    const respuesta = await request(app).get("/api/v1/bridges");
    expect(respuesta.status).toBe(401);
  });
});
