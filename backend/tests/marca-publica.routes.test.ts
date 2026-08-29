import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

/**
 * PASO 5 (tema-empresarial-integracion): `GET /marca-publica` es el único
 * endpoint del backend sin `requireAuthentication` para branding -- debe
 * responder 200 sin token (nunca 401) y llevar el rate-limit montado
 * (`marca-publica-rate-limit.middleware.ts`). Mismo criterio de aislamiento
 * que `configuracion-empresa.routes.test.ts`: `configuracion_empresa` es una
 * tabla singleton compartida por toda la suite.
 */
const app = createApp();

beforeAll(async () => {
  await prisma.configuracionEmpresa.deleteMany();
});

afterAll(async () => {
  await prisma.configuracionEmpresa.deleteMany();
  await prisma.$disconnect();
});

describe("GET /api/v1/marca-publica", () => {
  it("200 SIN token de acceso -- nunca 401", async () => {
    const respuesta = await request(app).get("/api/v1/marca-publica");

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      nombre: expect.any(String),
      colorPrimario: expect.stringMatching(/^#[0-9a-fA-F]{6}$/),
      colorSecundario: expect.stringMatching(/^#[0-9a-fA-F]{6}$/),
      logoUrl: null,
    });
  });

  it("expone SOLO nombre/colores/logo -- nada administrativo (id, actualizadoEn)", async () => {
    const respuesta = await request(app).get("/api/v1/marca-publica");

    expect(respuesta.status).toBe(200);
    expect(Object.keys(respuesta.body).sort()).toEqual(
      ["colorPrimario", "colorSecundario", "logoUrl", "nombre"].sort(),
    );
  });

  it("aplica el mismo lazy init que GET /configuracion-empresa (no exige seed previo)", async () => {
    await prisma.configuracionEmpresa.deleteMany();

    const respuesta = await request(app).get("/api/v1/marca-publica");

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.nombre).toBe("CRM Embudo de Leads");
    const total = await prisma.configuracionEmpresa.count();
    expect(total).toBe(1);
  });

  it("lleva el middleware de rate-limit montado (header estándar presente)", async () => {
    const respuesta = await request(app).get("/api/v1/marca-publica");

    // `standardHeaders: true` (RFC draft-7) -- confirma que el rate-limiter
    // está efectivamente en el pipeline sin testear el límite exacto a
    // fondo (alcanza con confirmar que el middleware está montado).
    expect(respuesta.headers).toHaveProperty("ratelimit-limit");
    expect(respuesta.headers).toHaveProperty("ratelimit-remaining");
  });
});
