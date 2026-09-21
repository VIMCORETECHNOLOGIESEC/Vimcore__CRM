import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

/**
 * Cliente tenant-scoped (migration `cliente_empresa_tenant_isolation`):
 * verifies the migrated schema against the real test database, same pattern
 * as `schema.bloque-c-empresa-not-null.test.ts`. Raw INSERTs confirm the
 * constraint on the COLUMN in Postgres, not only the generated TS types.
 */
afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

async function crearEmpresa(): Promise<string> {
  const empresa = await testAdminPrisma.empresa.create({
    data: { nombre: `Empresa cliente-tenant ${randomUUID()}` },
  });
  return empresa.id;
}

function telefonoUnico(): string {
  return `+5930${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`;
}

describe("schema — clientes.empresa_id (tenant-scoped Cliente)", () => {
  it("clientes.empresa_id is NOT NULL: a raw INSERT without empresa_id is rejected (23502)", async () => {
    await expect(
      testAdminPrisma.$executeRawUnsafe(
        `INSERT INTO "clientes" ("id", "telefono_valido", "creado_en") VALUES ($1::uuid, false, now())`,
        randomUUID(),
      ),
    ).rejects.toThrow(/23502/);
  });

  it("clientes.empresa_id has an FK to empresas: an unknown empresa_id is rejected (23503)", async () => {
    await expect(
      testAdminPrisma.$executeRawUnsafe(
        `INSERT INTO "clientes" ("id", "empresa_id", "telefono_valido", "creado_en") VALUES ($1::uuid, $2::uuid, false, now())`,
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toThrow(/23503/);
  });

  it("unique (empresa_id, telefono_normalizado): the same phone twice in ONE empresa is rejected (P2002)", async () => {
    const telefonoNormalizado = telefonoUnico();
    await testAdminPrisma.cliente.create({
      data: { empresaId: EMPRESA_BOOTSTRAP_ID, telefonoNormalizado, telefonoValido: true },
    });

    await expect(
      testAdminPrisma.cliente.create({
        data: { empresaId: EMPRESA_BOOTSTRAP_ID, telefonoNormalizado, telefonoValido: true },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("unique (empresa_id, telefono_normalizado): the same phone in TWO empresas is allowed (the old global unique is gone)", async () => {
    const telefonoNormalizado = telefonoUnico();
    const otraEmpresa = await crearEmpresa();

    const a = await testAdminPrisma.cliente.create({
      data: { empresaId: EMPRESA_BOOTSTRAP_ID, telefonoNormalizado, telefonoValido: true },
    });
    const b = await testAdminPrisma.cliente.create({
      data: { empresaId: otraEmpresa, telefonoNormalizado, telefonoValido: true },
    });

    expect(a.id).not.toBe(b.id);
    const indices = await testAdminPrisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'clientes'`;
    const nombres = indices.map((i) => i.indexname);
    expect(nombres).toContain("clientes_empresa_id_telefono_normalizado_key");
    expect(nombres).not.toContain("clientes_telefono_normalizado_key");
  });

  it("Cliente rows with NULL telefono_normalizado never collide within an empresa (phone-less clients)", async () => {
    await testAdminPrisma.cliente.create({
      data: { empresaId: EMPRESA_BOOTSTRAP_ID, nombre: "Sin telefono 1", telefonoValido: false },
    });
    await expect(
      testAdminPrisma.cliente.create({
        data: { empresaId: EMPRESA_BOOTSTRAP_ID, nombre: "Sin telefono 2", telefonoValido: false },
      }),
    ).resolves.toBeDefined();
  });
});

describe("schema — RLS on clientes", () => {
  it("a restricted tenant only sees the Clientes of its own empresa, even by exact id", async () => {
    const empresaB = await crearEmpresa();
    const clienteA = await testAdminPrisma.cliente.create({
      data: { empresaId: EMPRESA_BOOTSTRAP_ID, nombre: `RLS A ${randomUUID()}`, telefonoValido: false },
    });
    const clienteB = await testAdminPrisma.cliente.create({
      data: { empresaId: empresaB, nombre: `RLS B ${randomUUID()}`, telefonoValido: false },
    });

    const visibles = await runWithTenantContext({ empresaId: EMPRESA_BOOTSTRAP_ID }, async () =>
      prisma.cliente.findMany({ where: { id: { in: [clienteA.id, clienteB.id] } } }),
    );
    expect(visibles.map((c) => c.id)).toEqual([clienteA.id]);

    // Fail-closed without TenantContext: no rows, no error.
    const sinContexto = await prisma.cliente.findMany({ where: { id: { in: [clienteA.id, clienteB.id] } } });
    expect(sinContexto).toEqual([]);

    // Holding-wide (unrestricted) context sees both.
    const holding = await runWithTenantContext({ unrestricted: true }, async () =>
      prisma.cliente.findMany({ where: { id: { in: [clienteA.id, clienteB.id] } } }),
    );
    expect(holding).toHaveLength(2);
  });

  it("WITH CHECK: a restricted tenant cannot insert a Cliente for another empresa", async () => {
    const empresaB = await crearEmpresa();

    await expect(
      runWithTenantContext({ empresaId: EMPRESA_BOOTSTRAP_ID }, async () =>
        prisma.cliente.create({
          data: { empresaId: empresaB, nombre: `RLS cross ${randomUUID()}`, telefonoValido: false },
        }),
      ),
    ).rejects.toThrow();
  });
});
