import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

/**
 * Holding model (migrations `holding_tenant_table`, `holding_admin_role`,
 * `holding_admin_backfill`): verifies the migrated schema against the real
 * test database, same pattern as `schema.cliente-empresa-tenant.test.ts`.
 * Raw statements confirm constraints in Postgres, not only the generated types.
 */
afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

async function crearHolding(): Promise<string> {
  const holding = await testAdminPrisma.holding.create({
    data: { nombre: `Holding ${randomUUID()}` },
  });
  return holding.id;
}

function usuarioData(overrides: Record<string, unknown> = {}) {
  return {
    nombre: "Holding admin",
    correo: `holding-admin-${randomUUID()}@example.test`,
    passwordHash: "x",
    rol: "ADMINISTRADOR_HOLDING" as const,
    ...overrides,
  };
}

describe("schema — Holding", () => {
  it("rol_usuario includes ADMINISTRADOR_HOLDING", async () => {
    const filas = await testAdminPrisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'rol_usuario'`;
    expect(filas.map((f) => f.enumlabel)).toContain("ADMINISTRADOR_HOLDING");
  });

  it("one holding owns SEVERAL empresas (Empresa.holdingId -> Holding)", async () => {
    const holdingId = await crearHolding();
    const a = await testAdminPrisma.empresa.create({ data: { nombre: `Empresa A ${randomUUID()}`, holdingId } });
    const b = await testAdminPrisma.empresa.create({ data: { nombre: `Empresa B ${randomUUID()}`, holdingId } });

    const holding = await testAdminPrisma.holding.findUniqueOrThrow({
      where: { id: holdingId },
      include: { empresas: true },
    });
    expect(holding.empresas.map((e) => e.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("empresas.holding_id stays NULLABLE: an empresa without holding is accepted", async () => {
    const empresa = await testAdminPrisma.empresa.create({ data: { nombre: `Sin holding ${randomUUID()}` } });
    expect(empresa.holdingId).toBeNull();
  });

  it("empresas.holding_id has an FK to holdings: an unknown holding_id is rejected (P2003)", async () => {
    await expect(
      testAdminPrisma.empresa.create({ data: { nombre: `FK ${randomUUID()}`, holdingId: randomUUID() } }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("an ADMINISTRADOR_HOLDING user belongs to one holding (Usuario.holdingId) and the holding lists its users", async () => {
    const holdingId = await crearHolding();
    const usuario = await testAdminPrisma.usuario.create({ data: usuarioData({ holdingId }) });

    expect(usuario.rol).toBe("ADMINISTRADOR_HOLDING");
    expect(usuario.holdingId).toBe(holdingId);
    const holding = await testAdminPrisma.holding.findUniqueOrThrow({
      where: { id: holdingId },
      include: { usuarios: true },
    });
    expect(holding.usuarios.map((u) => u.id)).toEqual([usuario.id]);
  });

  it("usuarios.holding_id is NULLABLE: company users carry no holding", async () => {
    const usuario = await testAdminPrisma.usuario.create({ data: usuarioData({ rol: "ADMINISTRADOR", holdingId: null }) });
    expect(usuario.holdingId).toBeNull();
  });

  it("usuarios.holding_id has an FK to holdings: an unknown holding_id is rejected (P2003)", async () => {
    await expect(
      testAdminPrisma.usuario.create({ data: usuarioData({ holdingId: randomUUID() }) }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("a holding that still owns empresas or users cannot be deleted (ON DELETE RESTRICT)", async () => {
    const conEmpresa = await crearHolding();
    await testAdminPrisma.empresa.create({ data: { nombre: `Owned ${randomUUID()}`, holdingId: conEmpresa } });
    await expect(testAdminPrisma.holding.delete({ where: { id: conEmpresa } })).rejects.toMatchObject({
      code: "P2003",
    });

    const conUsuario = await crearHolding();
    await testAdminPrisma.usuario.create({ data: usuarioData({ holdingId: conUsuario }) });
    await expect(testAdminPrisma.holding.delete({ where: { id: conUsuario } })).rejects.toMatchObject({
      code: "P2003",
    });
  });

  it("holdings has no RLS (identity table, same as empresas)", async () => {
    const filas = await testAdminPrisma.$queryRaw<{ relrowsecurity: boolean }[]>`
      SELECT relrowsecurity FROM pg_class WHERE relname = 'holdings'`;
    expect(filas[0]?.relrowsecurity).toBe(false);
  });
});
