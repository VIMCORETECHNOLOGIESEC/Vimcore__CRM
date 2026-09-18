import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import {
  AuthProvisioningConflictError,
  provisionCrmCompanyAdmin,
  type ProvisionCrmCompanyInput,
} from "../src/services/auth-provisioning.service.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

/**
 * holding-admin-gateway-auth (T5b): idempotent provisioning of Holding + Empresa
 * + ADMINISTRADOR_HOLDING Usuario from the auth `CompanyModuleSubscribed` event,
 * against the real test database. `holdings`/`empresas`/`usuarios` have no RLS,
 * so the service runs with no TenantContext; fixtures and read-backs use the
 * admin client, the code under test uses the real `crm_app` client.
 */
afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

function evento(overrides: Partial<ProvisionCrmCompanyInput> = {}): ProvisionCrmCompanyInput {
  return {
    companyId: randomUUID(),
    legalName: `Legal name ${randomUUID()}`,
    adminUserId: randomUUID(),
    adminEmail: `admin-${randomUUID()}@example.test`,
    adminFullName: "Ada Admin",
    ...overrides,
  };
}

async function estado(input: ProvisionCrmCompanyInput) {
  const empresas = await testAdminPrisma.empresa.findMany({ where: { authCompanyId: input.companyId } });
  const usuarios = await testAdminPrisma.usuario.findMany({ where: { authUserId: input.adminUserId } });
  const holdings = await testAdminPrisma.holding.findMany({ where: { nombre: input.legalName } });
  const membresias = await testAdminPrisma.membresia.count({
    where: { usuarioId: { in: usuarios.map((u) => u.id) } },
  });
  return { empresas, usuarios, holdings, membresias };
}

describe("auth-provisioning.service — full flow", () => {
  it("creates the Holding, the linked Empresa and the ADMINISTRADOR_HOLDING Usuario (no Membresia)", async () => {
    const input = evento();

    const result = await provisionCrmCompanyAdmin(input);

    expect(result.outcome).toBe("provisioned");
    const { empresas, usuarios, holdings, membresias } = await estado(input);
    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.id).toBe(result.holdingId);
    expect(empresas).toHaveLength(1);
    expect(empresas[0]).toMatchObject({
      id: result.empresaId,
      nombre: input.legalName,
      authCompanyId: input.companyId,
      holdingId: result.holdingId,
    });
    expect(usuarios).toHaveLength(1);
    expect(usuarios[0]).toMatchObject({
      id: result.usuarioId,
      rol: "ADMINISTRADOR_HOLDING",
      holdingId: result.holdingId,
      authUserId: input.adminUserId,
      nombre: input.adminFullName,
      correo: input.adminEmail,
      activo: true,
    });
    expect(membresias).toBe(0);
  });

  it("stores an unusable random password hash (two admins never share one)", async () => {
    const a = evento();
    const b = evento();
    await provisionCrmCompanyAdmin(a);
    await provisionCrmCompanyAdmin(b);

    const [ua] = (await estado(a)).usuarios;
    const [ub] = (await estado(b)).usuarios;
    expect(ua?.passwordHash).toBeTruthy();
    expect(ua?.passwordHash).not.toBe(ub?.passwordHash);
  });

  it("the provisioned admin passes the gateway trust path with holding scope", async () => {
    const input = evento();
    await provisionCrmCompanyAdmin(input);
    const app = createApp();
    const secret = env.CRM_GATEWAY_SECRET as string;

    const perfil = await request(app)
      .get("/api/v1/auth/perfil")
      .set({ "x-gateway-secret": secret, "x-gateway-user-id": input.adminUserId });
    const empresas = await request(app)
      .get("/api/v1/empresas")
      .set({ "x-gateway-secret": secret, "x-gateway-user-id": input.adminUserId });

    expect(perfil.status).toBe(200);
    expect(perfil.body).toMatchObject({ rol: "ADMINISTRADOR_HOLDING", sessionScope: "holding", empresaId: null });
    expect(empresas.status).toBe(200);
  });
});

describe("auth-provisioning.service — idempotency and partial states", () => {
  it("a second delivery is a no-op: no duplicates, same ids", async () => {
    const input = evento();
    const first = await provisionCrmCompanyAdmin(input);

    const second = await provisionCrmCompanyAdmin(input);

    expect(second).toEqual({ ...first, outcome: "noop" });
    const { empresas, usuarios, holdings } = await estado(input);
    expect([empresas.length, usuarios.length, holdings.length]).toEqual([1, 1, 1]);
  });

  it("concurrent redeliveries converge to a single complete state without errors", async () => {
    const input = evento();

    const results = await Promise.all([
      provisionCrmCompanyAdmin(input),
      provisionCrmCompanyAdmin(input),
      provisionCrmCompanyAdmin(input),
    ]);

    expect(new Set(results.map((r) => r.usuarioId)).size).toBe(1);
    expect(new Set(results.map((r) => r.empresaId)).size).toBe(1);
    const { empresas, usuarios, holdings } = await estado(input);
    expect([empresas.length, usuarios.length]).toEqual([1, 1]);
    expect(holdings).toHaveLength(1);
    expect(empresas[0]?.holdingId).toBe(holdings[0]?.id);
    expect(usuarios[0]?.holdingId).toBe(holdings[0]?.id);
  });

  it("Empresa exists without holding and the admin is missing: creates the holding, links it and creates the admin", async () => {
    const input = evento();
    const empresa = await testAdminPrisma.empresa.create({
      data: { nombre: "Old name", authCompanyId: input.companyId },
    });

    const result = await provisionCrmCompanyAdmin(input);

    expect(result.empresaId).toBe(empresa.id);
    const { empresas, usuarios, holdings } = await estado(input);
    expect(empresas).toHaveLength(1);
    expect(empresas[0]?.holdingId).toBe(holdings[0]?.id);
    expect(usuarios[0]).toMatchObject({ rol: "ADMINISTRADOR_HOLDING", holdingId: holdings[0]?.id });
  });

  it("Empresa already in a holding and the admin is missing: reuses that holding", async () => {
    const input = evento();
    const holding = await testAdminPrisma.holding.create({ data: { nombre: `Existing ${randomUUID()}` } });
    await testAdminPrisma.empresa.create({
      data: { nombre: "Linked", authCompanyId: input.companyId, holdingId: holding.id },
    });

    const result = await provisionCrmCompanyAdmin(input);

    expect(result.holdingId).toBe(holding.id);
    expect(await testAdminPrisma.holding.count({ where: { nombre: input.legalName } })).toBe(0);
    const { usuarios } = await estado(input);
    expect(usuarios[0]?.holdingId).toBe(holding.id);
  });

  it("admin exists in a holding and the Empresa is missing: creates the Empresa inside that holding", async () => {
    const input = evento();
    const holding = await testAdminPrisma.holding.create({ data: { nombre: `Admin holding ${randomUUID()}` } });
    const admin = await testAdminPrisma.usuario.create({
      data: {
        nombre: "Ada Admin",
        correo: input.adminEmail,
        passwordHash: "x",
        rol: "ADMINISTRADOR_HOLDING",
        authUserId: input.adminUserId,
        holdingId: holding.id,
      },
    });

    const result = await provisionCrmCompanyAdmin(input);

    expect(result).toMatchObject({ holdingId: holding.id, usuarioId: admin.id });
    const { empresas } = await estado(input);
    expect(empresas).toHaveLength(1);
    expect(empresas[0]).toMatchObject({ holdingId: holding.id, nombre: input.legalName });
  });

  it("admin exists without holding and the Empresa exists without holding: both end in one new holding", async () => {
    const input = evento();
    await testAdminPrisma.empresa.create({ data: { nombre: "E", authCompanyId: input.companyId } });
    await testAdminPrisma.usuario.create({
      data: {
        nombre: "Ada Admin",
        correo: input.adminEmail,
        passwordHash: "x",
        rol: "ADMINISTRADOR_HOLDING",
        authUserId: input.adminUserId,
      },
    });

    await provisionCrmCompanyAdmin(input);

    const { empresas, usuarios, holdings } = await estado(input);
    expect(holdings).toHaveLength(1);
    expect(empresas[0]?.holdingId).toBe(holdings[0]?.id);
    expect(usuarios[0]?.holdingId).toBe(holdings[0]?.id);
  });
});

describe("auth-provisioning.service — email conflicts (account takeover guard)", () => {
  async function sinCreados(input: ProvisionCrmCompanyInput) {
    const { empresas, usuarios, holdings } = await estado(input);
    expect([empresas.length, usuarios.length, holdings.length]).toEqual([0, 0, 0]);
  }

  it("rejects an existing unlinked Usuario with the same email, creates nothing and leaves it untouched", async () => {
    const input = evento();
    const victim = await testAdminPrisma.usuario.create({
      data: { nombre: "Victim", correo: input.adminEmail, passwordHash: "victim-hash", rol: "ASESOR" },
    });

    await expect(provisionCrmCompanyAdmin(input)).rejects.toMatchObject({
      name: "AuthProvisioningConflictError",
      reason: "admin_email_conflict",
    });

    await sinCreados(input);
    const after = await testAdminPrisma.usuario.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after).toMatchObject({
      authUserId: null,
      holdingId: null,
      rol: "ASESOR",
      passwordHash: "victim-hash",
      nombre: "Victim",
    });
  });

  it("rejects an existing Usuario linked to ANOTHER auth user with the same email", async () => {
    const input = evento();
    const otherAuthUserId = randomUUID();
    await testAdminPrisma.usuario.create({
      data: {
        nombre: "Other",
        correo: input.adminEmail,
        passwordHash: "x",
        rol: "ADMINISTRADOR",
        authUserId: otherAuthUserId,
      },
    });

    await expect(provisionCrmCompanyAdmin(input)).rejects.toBeInstanceOf(AuthProvisioningConflictError);

    await sinCreados(input);
    const other = await testAdminPrisma.usuario.findUniqueOrThrow({ where: { authUserId: otherAuthUserId } });
    expect(other.holdingId).toBeNull();
  });

  it("matches the email case-insensitively (Citext)", async () => {
    const input = evento({ adminEmail: `mixed-${randomUUID()}@example.test` });
    await testAdminPrisma.usuario.create({
      data: {
        nombre: "Victim",
        correo: input.adminEmail.toUpperCase(),
        passwordHash: "x",
        rol: "SUPERVISOR",
      },
    });

    await expect(provisionCrmCompanyAdmin(input)).rejects.toMatchObject({ reason: "admin_email_conflict" });

    await sinCreados(input);
  });

  it("rejects when the Usuario linked by authUserId is not a holding administrator", async () => {
    const input = evento();
    await testAdminPrisma.usuario.create({
      data: {
        nombre: "Advisor",
        correo: `advisor-${randomUUID()}@example.test`,
        passwordHash: "x",
        rol: "ASESOR",
        authUserId: input.adminUserId,
      },
    });

    await expect(provisionCrmCompanyAdmin(input)).rejects.toMatchObject({ reason: "admin_user_mismatch" });

    expect(await testAdminPrisma.empresa.count({ where: { authCompanyId: input.companyId } })).toBe(0);
    expect(await testAdminPrisma.holding.count({ where: { nombre: input.legalName } })).toBe(0);
  });

  it("rejects when the admin and the empresa already belong to different holdings", async () => {
    const input = evento();
    const h1 = await testAdminPrisma.holding.create({ data: { nombre: `H1 ${randomUUID()}` } });
    const h2 = await testAdminPrisma.holding.create({ data: { nombre: `H2 ${randomUUID()}` } });
    await testAdminPrisma.empresa.create({
      data: { nombre: "E", authCompanyId: input.companyId, holdingId: h1.id },
    });
    await testAdminPrisma.usuario.create({
      data: {
        nombre: "Ada Admin",
        correo: input.adminEmail,
        passwordHash: "x",
        rol: "ADMINISTRADOR_HOLDING",
        authUserId: input.adminUserId,
        holdingId: h2.id,
      },
    });

    await expect(provisionCrmCompanyAdmin(input)).rejects.toMatchObject({ reason: "admin_user_mismatch" });
  });
});
