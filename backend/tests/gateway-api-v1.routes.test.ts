import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { signAccessToken } from "../src/lib/jwt.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

/**
 * holding-admin-gateway-auth (T2): gateway trust on `/api/v1` (transitional
 * dual mode with the CRM JWT). `/auth/perfil` echoes `req.user`; `/empresas`
 * is holding-scope only (`requireRole` + `sessionScope` guard).
 */
const app = createApp();

const SECRET = env.CRM_GATEWAY_SECRET;
if (!SECRET) {
  throw new Error("CRM_GATEWAY_SECRET no está configurado en el entorno de test.");
}

type Rol = "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "ADMINISTRADOR_HOLDING" | "SUPERVISOR_HOLDING";

async function crearHolding() {
  return testAdminPrisma.holding.create({ data: { nombre: `Holding gw ${randomUUID()}` } });
}

async function crearEmpresa() {
  return testAdminPrisma.empresa.create({
    data: { nombre: `Empresa gw v1 ${randomUUID()}`, authCompanyId: randomUUID() },
  });
}

async function crearUsuario(rol: Rol, extra: { holdingId?: string; activo?: boolean } = {}) {
  return testAdminPrisma.usuario.create({
    data: {
      nombre: `Usuario gw v1 ${rol}`,
      correo: `gw-v1-${randomUUID()}@integracion.test`,
      passwordHash: "x",
      rol,
      activo: extra.activo ?? true,
      authUserId: randomUUID(),
      holdingId: extra.holdingId,
    },
  });
}

async function crearCompanyUser(rol: "ADMINISTRADOR" | "ASESOR" = "ASESOR") {
  const empresa = await crearEmpresa();
  const usuario = await crearUsuario(rol);
  await testAdminPrisma.membresia.create({
    data: { usuarioId: usuario.id, empresaId: empresa.id, rol, activa: true },
  });
  return { empresa, usuario };
}

function gw(authUserId: string | null, authCompanyId?: string | null, secret: string = SECRET as string) {
  const headers: Record<string, string> = { "x-gateway-secret": secret };
  if (authUserId) headers["x-gateway-user-id"] = authUserId;
  if (authCompanyId) headers["x-gateway-company-id"] = authCompanyId;
  return headers;
}

afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

describe("/api/v1 gateway trust — company user", () => {
  it("200: company session resolved from Membresia (headers only assert identity)", async () => {
    const { empresa, usuario } = await crearCompanyUser("ADMINISTRADOR");

    const res = await request(app)
      .get("/api/v1/auth/perfil")
      .set(gw(usuario.authUserId, empresa.authCompanyId));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: usuario.id,
      rol: "ADMINISTRADOR",
      sessionScope: "company",
      empresaId: empresa.id,
      empresaNombre: empresa.nombre,
    });
  });

  it("403 identidad_no_vinculada: company asserted by the gateway is not one of the user's Membresias", async () => {
    const { usuario } = await crearCompanyUser();
    const ajena = await crearEmpresa();

    const res = await request(app)
      .get("/api/v1/auth/perfil")
      .set(gw(usuario.authUserId, ajena.authCompanyId));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("identidad_no_vinculada");
  });

  it("403 identidad_no_vinculada: company user without company header", async () => {
    const { usuario } = await crearCompanyUser();

    const res = await request(app).get("/api/v1/auth/perfil").set(gw(usuario.authUserId));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("identidad_no_vinculada");
  });

  it("403 identidad_no_vinculada: inactive user", async () => {
    const { empresa, usuario } = await crearCompanyUser();
    await testAdminPrisma.usuario.update({ where: { id: usuario.id }, data: { activo: false } });

    const res = await request(app)
      .get("/api/v1/auth/perfil")
      .set(gw(usuario.authUserId, empresa.authCompanyId));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("identidad_no_vinculada");
  });
});

describe("/api/v1 gateway trust — holding-scoped users", () => {
  it("200: ADMINISTRADOR_HOLDING without company header -> holding scope, empresaId null", async () => {
    const holding = await crearHolding();
    const usuario = await crearUsuario("ADMINISTRADOR_HOLDING", { holdingId: holding.id });

    const res = await request(app).get("/api/v1/auth/perfil").set(gw(usuario.authUserId));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: usuario.id,
      rol: "ADMINISTRADOR_HOLDING",
      sessionScope: "holding",
      empresaId: null,
      empresaNombre: null,
    });
  });

  it("200: ADMINISTRADOR_HOLDING can use a holding-only route (GET /empresas) through the gateway", async () => {
    const holding = await crearHolding();
    const usuario = await crearUsuario("ADMINISTRADOR_HOLDING", { holdingId: holding.id });

    const res = await request(app).get("/api/v1/empresas").set(gw(usuario.authUserId));

    expect(res.status).toBe(200);
  });

  it("200: SUPERVISOR_HOLDING without company header -> holding scope", async () => {
    const holding = await crearHolding();
    const usuario = await crearUsuario("SUPERVISOR_HOLDING", { holdingId: holding.id });

    const res = await request(app).get("/api/v1/auth/perfil").set(gw(usuario.authUserId));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rol: "SUPERVISOR_HOLDING", sessionScope: "holding", empresaId: null });
  });

  it("a company header cannot narrow a holding user: scope stays holding", async () => {
    const holding = await crearHolding();
    const usuario = await crearUsuario("ADMINISTRADOR_HOLDING", { holdingId: holding.id });
    const empresa = await crearEmpresa();

    const res = await request(app)
      .get("/api/v1/auth/perfil")
      .set(gw(usuario.authUserId, empresa.authCompanyId));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sessionScope: "holding", empresaId: null });
  });

  it("403 identidad_no_vinculada: holding role without Usuario.holdingId", async () => {
    const usuario = await crearUsuario("ADMINISTRADOR_HOLDING");

    const res = await request(app).get("/api/v1/auth/perfil").set(gw(usuario.authUserId));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("identidad_no_vinculada");
  });

  it("403 identidad_no_vinculada: inactive holding admin", async () => {
    const holding = await crearHolding();
    const usuario = await crearUsuario("ADMINISTRADOR_HOLDING", { holdingId: holding.id, activo: false });

    const res = await request(app).get("/api/v1/auth/perfil").set(gw(usuario.authUserId));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("identidad_no_vinculada");
  });
});

describe("/api/v1 gateway trust — secret handling and unlinked identity", () => {
  it("401 gateway_no_autorizado: wrong secret, even with a valid CRM JWT (no fallback)", async () => {
    const holding = await crearHolding();
    const usuario = await crearUsuario("ADMINISTRADOR_HOLDING", { holdingId: holding.id });
    const token = await signAccessToken({ id: usuario.id, rol: usuario.rol, sessionScope: "holding" });

    const res = await request(app)
      .get("/api/v1/auth/perfil")
      .set(gw(usuario.authUserId, null, "secreto-invalido-no-coincide"))
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("gateway_no_autorizado");
  });

  it("401 no_autenticado: identity headers without the secret are not honored", async () => {
    const holding = await crearHolding();
    const usuario = await crearUsuario("ADMINISTRADOR_HOLDING", { holdingId: holding.id });

    const res = await request(app)
      .get("/api/v1/auth/perfil")
      .set("x-gateway-user-id", usuario.authUserId);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("no_autenticado");
  });

  it("403 identidad_no_vinculada: secret valid but authUserId not linked to any Usuario", async () => {
    const res = await request(app).get("/api/v1/auth/perfil").set(gw(randomUUID()));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("identidad_no_vinculada");
  });
});

describe("/api/v1 — CRM JWT path still works without the gateway secret header", () => {
  it("200: legacy holding-wide ADMINISTRADOR JWT keeps working", async () => {
    const usuario = await crearUsuario("ADMINISTRADOR");
    const token = await signAccessToken({ id: usuario.id, rol: usuario.rol, sessionScope: "holding" });

    const res = await request(app).get("/api/v1/auth/perfil").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: usuario.id, sessionScope: "holding", empresaId: null });
  });
});
