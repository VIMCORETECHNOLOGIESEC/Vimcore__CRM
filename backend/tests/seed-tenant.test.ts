import { randomUUID } from "node:crypto";
import type { RolUsuario } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { BOOTSTRAP_EMPRESA_ID, seedTenant } from "../prisma/seed-tenant.js";

/**
 * Bloque B (Fase 5, diseño "seed.ts strategy"): `seedTenant` es el helper
 * extraído que `prisma/seed.ts::main()` invoca tras sembrar los usuarios de
 * demo — se testea acá aislado (import directo, sin ejecutar `main()`, que
 * exige `SEED_PASSWORD`/`SEED_BRIDGE_CLAVE_API` y llama `process.exit`).
 * Mismo mapeo FIJO que el backfill de producción (spec membership-backfill).
 */
let contador = 0;

async function crearUsuario(rol: RolUsuario): Promise<{ id: string; rol: RolUsuario }> {
  contador += 1;
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre: `Usuario Seed ${contador}`,
      correo: `usuario-seed-${contador}-${randomUUID()}@t.local`,
      passwordHash: "x",
      rol,
    },
  });
  return { id: usuario.id, rol: usuario.rol };
}

describe("prisma/seed-tenant — seedTenant (Bloque B, Fase 5)", () => {
  it("crea la Empresa bootstrap (id fijo) y una Membresia por usuario con el mapeo fijo por rol", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const supervisor = await crearUsuario("SUPERVISOR");
    const asesor = await crearUsuario("ASESOR");
    const vendedor = await crearUsuario("VENDEDOR");
    const usuarios = [admin, supervisor, asesor, vendedor];

    await seedTenant(testAdminPrisma, usuarios);

    const empresa = await testAdminPrisma.empresa.findUnique({ where: { id: BOOTSTRAP_EMPRESA_ID } });
    expect(empresa).not.toBeNull();

    const membresias = await testAdminPrisma.membresia.findMany({
      where: { usuarioId: { in: usuarios.map((u) => u.id) } },
    });
    expect(membresias).toHaveLength(4);

    const porUsuario = new Map(membresias.map((m) => [m.usuarioId, m]));
    expect(porUsuario.get(admin.id)).toMatchObject({
      rol: "ADMINISTRADOR",
      habilitadoParaVenta: false,
      empresaId: BOOTSTRAP_EMPRESA_ID,
    });
    expect(porUsuario.get(supervisor.id)).toMatchObject({
      rol: "SUPERVISOR",
      habilitadoParaVenta: false,
      empresaId: BOOTSTRAP_EMPRESA_ID,
    });
    expect(porUsuario.get(asesor.id)).toMatchObject({
      rol: "ASESOR",
      habilitadoParaVenta: false,
      empresaId: BOOTSTRAP_EMPRESA_ID,
    });
    expect(porUsuario.get(vendedor.id)).toMatchObject({
      rol: "ASESOR",
      habilitadoParaVenta: true,
      empresaId: BOOTSTRAP_EMPRESA_ID,
    });
  });

  it("es idempotente: correr seedTenant dos veces no duplica la Empresa bootstrap ni las Membresia", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");

    await seedTenant(testAdminPrisma, [admin]);
    await seedTenant(testAdminPrisma, [admin]);
    await seedTenant(testAdminPrisma, [admin]);

    const empresas = await testAdminPrisma.empresa.findMany({ where: { id: BOOTSTRAP_EMPRESA_ID } });
    expect(empresas).toHaveLength(1);

    const membresias = await testAdminPrisma.membresia.findMany({ where: { usuarioId: admin.id } });
    expect(membresias).toHaveLength(1);
  });
});

