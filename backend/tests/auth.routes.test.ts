import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const PASSWORD_ACTIVO = "clave-integracion-123";
const PASSWORD_INACTIVO = "clave-inactivo-123";

let correoActivo: string;
let correoInactivo: string;

beforeAll(async () => {
  correoActivo = "activo@integracion.test";
  correoInactivo = "inactivo@integracion.test";

  await prisma.usuario.create({
    data: {
      nombre: "Usuario Activo",
      correo: correoActivo,
      passwordHash: await hashPassword(PASSWORD_ACTIVO),
      rol: "VENDEDOR",
      activo: true,
    },
  });

  await prisma.usuario.create({
    data: {
      nombre: "Usuario Inactivo",
      correo: correoInactivo,
      passwordHash: await hashPassword(PASSWORD_INACTIVO),
      rol: "VENDEDOR",
      activo: false,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function firmarTokenExpirado(sub: string): Promise<string> {
  const secretKey = new TextEncoder().encode(env.JWT_SECRET);
  return new SignJWT({ rol: "VENDEDOR", type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer("crm-embudo-leads")
    .setAudience("crm-api")
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(secretKey);
}

describe("POST /api/v1/auth/login", () => {
  it("200 con accessToken y refreshToken cuando las credenciales son válidas", async () => {
    const respuesta = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: correoActivo, password: PASSWORD_ACTIVO });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.accessToken).toEqual(expect.any(String));
    expect(respuesta.body.refreshToken).toEqual(expect.any(String));
    expect(respuesta.body.user.correo).toBe(correoActivo);
    expect(respuesta.body.user.passwordHash).toBeUndefined();
  });

  it("401 con contraseña incorrecta, sin emitir tokens", async () => {
    const respuesta = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: correoActivo, password: "clave-incorrecta" });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.accessToken).toBeUndefined();
  });

  it("401 cuando el usuario está inactivo, aunque la contraseña sea correcta", async () => {
    const respuesta = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: correoInactivo, password: PASSWORD_INACTIVO });

    expect(respuesta.status).toBe(401);
  });

  it("400 con un body inválido (Zod en el borde), antes de tocar el servicio", async () => {
    const respuesta = await request(app).post("/api/v1/auth/login").send({ password: "x" });

    expect(respuesta.status).toBe(400);
  });

  it("responde con Access-Control-Allow-Origin para el origen del frontend (CORS)", async () => {
    const respuesta = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", env.CORS_ORIGIN)
      .send({ correo: correoActivo, password: PASSWORD_ACTIVO });

    expect(respuesta.headers["access-control-allow-origin"]).toBe(env.CORS_ORIGIN);
  });

  it("resuelve el preflight OPTIONS del login sin llegar a la lógica de negocio", async () => {
    const respuesta = await request(app)
      .options("/api/v1/auth/login")
      .set("Origin", env.CORS_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "Content-Type");

    expect(respuesta.status).toBe(204);
    expect(respuesta.headers["access-control-allow-origin"]).toBe(env.CORS_ORIGIN);
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("rota el par; el refresh anterior deja de servir y reutilizarlo revoca la familia", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: correoActivo, password: PASSWORD_ACTIVO });
    const refreshOriginal = login.body.refreshToken as string;

    const primeraRotacion = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: refreshOriginal });

    expect(primeraRotacion.status).toBe(200);
    const refreshRotado = primeraRotacion.body.refreshToken as string;
    expect(refreshRotado).not.toBe(refreshOriginal);

    // Reutilizar el refresh ya rotado (revocado) debe fallar y revocar la familia.
    const reutilizacion = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: refreshOriginal });
    expect(reutilizacion.status).toBe(401);

    // D-D: el nuevo refresh (parte de la misma familia) también queda revocado.
    const trasRevocacionFamilia = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: refreshRotado });
    expect(trasRevocacionFamilia.status).toBe(401);
  });

  it("401 con un refresh token inválido o inexistente", async () => {
    const respuesta = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "token-que-no-existe" });

    expect(respuesta.status).toBe(401);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("204 y deja el refresh inutilizable en el siguiente refresh", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: correoActivo, password: PASSWORD_ACTIVO });
    const { accessToken, refreshToken } = login.body;

    const logout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(logout.status).toBe(204);

    const refreshTrasLogout = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken });
    expect(refreshTrasLogout.status).toBe(401);
  });

  it("401 sin token de acceso (endpoint protegido)", async () => {
    const respuesta = await request(app)
      .post("/api/v1/auth/logout")
      .send({ refreshToken: "cualquiera" });

    expect(respuesta.status).toBe(401);
  });
});

describe("GET /api/v1/auth/perfil — matriz docs/06 L45", () => {
  it("200 con los datos del usuario autenticado cuando el token es válido", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: correoActivo, password: PASSWORD_ACTIVO });

    const respuesta = await request(app)
      .get("/api/v1/auth/perfil")
      .set("Authorization", `Bearer ${login.body.accessToken}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.correo).toBe(correoActivo);
    expect(respuesta.body.passwordHash).toBeUndefined();
  });

  it("401 sin header Authorization", async () => {
    const respuesta = await request(app).get("/api/v1/auth/perfil");
    expect(respuesta.status).toBe(401);
  });

  it("401 con un access token expirado", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: correoActivo, password: PASSWORD_ACTIVO });
    const usuarioId = login.body.user.id as string;
    const tokenExpirado = await firmarTokenExpirado(usuarioId);

    const respuesta = await request(app)
      .get("/api/v1/auth/perfil")
      .set("Authorization", `Bearer ${tokenExpirado}`);

    expect(respuesta.status).toBe(401);
  });
});
