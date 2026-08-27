import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

/**
 * Bloque B (Fase 1, spec tenant-empresa-membresia-schema / membership-backfill,
 * diseño "Schema Additions" / "Backfill mechanism"): verificación de la
 * migración `bloque_b_tenant_fundacion` contra la base de pruebas real (ya
 * migrada por `prisma migrate deploy` antes de `pnpm test`), mismo patrón que
 * `schema.m6-asignacion.test.ts`.
 *
 * Deviation from tasks (pragmatic, documented): el diseño habla de "aplicar
 * la migración contra una BD snapshot / corromper una fila a mitad del
 * script" para probar atomicidad. Invocar el CLI `prisma migrate` dentro de
 * un test de vitest no es práctico ni determinístico. En su lugar, esta
 * suite carga el SQL de backfill REAL (`migration.sql`, delimitado por los
 * marcadores `-- BACKFILL START/END`) y lo ejecuta vía `$executeRawUnsafe`
 * contra usuarios creados por el propio test — así se prueban las MISMAS
 * sentencias que corrieron en producción (sin duplicar una copia que pueda
 * desviarse), incluyendo idempotencia (re-ejecución) y atomicidad (rollback
 * de una transacción con una escritura corrupta a mitad de camino).
 */
const BOOTSTRAP_EMPRESA_ID = "00000000-0000-0000-0000-000000000001";
const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../prisma/migrations");

function leerBackfillSql(): string {
  const carpeta = readdirSync(MIGRATIONS_DIR).find((nombre) =>
    nombre.endsWith("_bloque_b_tenant_fundacion"),
  );
  if (!carpeta) {
    throw new Error("Migración bloque_b_tenant_fundacion no encontrada en prisma/migrations");
  }
  const contenido = readFileSync(path.join(MIGRATIONS_DIR, carpeta, "migration.sql"), "utf-8");
  const inicio = contenido.indexOf("-- BACKFILL START");
  const fin = contenido.indexOf("-- BACKFILL END");
  if (inicio === -1 || fin === -1) {
    throw new Error("Marcadores -- BACKFILL START/END no encontrados en migration.sql");
  }
  return contenido.slice(inicio, fin);
}

function sentenciasBackfill(): string[] {
  const sql = leerBackfillSql();
  const sinComentarios = sql
    .split("\n")
    .filter((linea) => !linea.trim().startsWith("--"))
    .join("\n");
  return sinComentarios
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function ejecutarBackfill(
  client: { $executeRawUnsafe: (sql: string) => Promise<number> } = testAdminPrisma,
): Promise<void> {
  for (const sentencia of sentenciasBackfill()) {
    await client.$executeRawUnsafe(`${sentencia};`);
  }
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("schema Bloque B — Empresa/Membresia/RolMembresia (tenant-empresa-membresia-schema)", () => {
  it("Empresa/Membresia existen; bridges/leads.empresa_id son NOT NULL (Bloque C, D4 cutover), refresh_tokens.membresia_id sigue nullable", async () => {
    // Bloque C (D4, Fase 2/Stage 2 — cutover bloqueante): `bridges.empresa_id`
    // y `leads.empresa_id` nacieron nullable en Bloque B (Fase 3,
    // lead-empresa-derivation) y migraron a NOT NULL sin backfill — no había
    // datos de producción (memoria #102). `refresh_tokens.membresia_id` es
    // ajeno a Bloque C (dual-login-routing) y permanece nullable sin cambios.
    const columnas = await prisma.$queryRaw<
      Array<{ table_name: string; column_name: string; is_nullable: string }>
    >`
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE (table_name = 'bridges' AND column_name = 'empresa_id')
         OR (table_name = 'leads' AND column_name = 'empresa_id')
         OR (table_name = 'refresh_tokens' AND column_name = 'membresia_id')
    `;
    expect(columnas).toHaveLength(3);
    const nullabilidadEsperada: Record<string, string> = {
      bridges: "NO",
      leads: "NO",
      refresh_tokens: "YES",
    };
    for (const columna of columnas) {
      expect(columna.is_nullable).toBe(nullabilidadEsperada[columna.table_name]);
    }
  });

  it("rol_membresia tiene exactamente ADMINISTRADOR/SUPERVISOR/ASESOR (sin VENDEDOR propio)", async () => {
    const valores = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'rol_membresia'
    `;
    expect(valores.map((v) => v.enumlabel).sort()).toEqual([
      "ADMINISTRADOR",
      "ASESOR",
      "SUPERVISOR",
    ]);
  });

  it("rol_usuario (legado) sigue teniendo sus 4 valores originales, sin cambios", async () => {
    const valores = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'rol_usuario'
    `;
    expect(valores.map((v) => v.enumlabel).sort()).toEqual([
      "ADMINISTRADOR",
      "ASESOR",
      "SUPERVISOR",
      "VENDEDOR",
    ]);
  });

  it("rechaza una tripleta (usuarioId, empresaId, rol) duplicada (Duplicate membership rejected)", async () => {
    const usuario = await prisma.usuario.create({
      data: {
        nombre: "Dup Test",
        correo: `dup-${randomUUID()}@t.local`,
        passwordHash: "x",
        rol: "ASESOR",
      },
    });
    await testAdminPrisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: BOOTSTRAP_EMPRESA_ID, rol: "ASESOR" },
    });

    await expect(
      testAdminPrisma.membresia.create({
        data: { usuarioId: usuario.id, empresaId: BOOTSTRAP_EMPRESA_ID, rol: "ASESOR" },
      }),
    ).rejects.toThrow();
  });

  it("la baja de una Membresia es un toggle (activa=false), la fila nunca se borra (Removal is a soft toggle)", async () => {
    const usuario = await prisma.usuario.create({
      data: {
        nombre: "Toggle Test",
        correo: `toggle-${randomUUID()}@t.local`,
        passwordHash: "x",
        rol: "SUPERVISOR",
      },
    });
    const membresia = await testAdminPrisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: BOOTSTRAP_EMPRESA_ID, rol: "SUPERVISOR" },
    });

    const desactivada = await testAdminPrisma.membresia.update({
      where: { id: membresia.id },
      data: { activa: false },
    });

    expect(desactivada.activa).toBe(false);
    const filaAunPresente = await testAdminPrisma.membresia.findUnique({ where: { id: membresia.id } });
    expect(filaAunPresente).not.toBeNull();
  });

  it("una sesión (refresh token) previa a la migración sigue funcionando, con membresiaId null (Active session after migration)", async () => {
    const usuario = await prisma.usuario.create({
      data: {
        nombre: "Sesion Previa",
        correo: `sesion-previa-${randomUUID()}@t.local`,
        passwordHash: "x",
        rol: "VENDEDOR",
      },
    });
    const token = await prisma.refreshToken.create({
      data: {
        jti: randomUUID(),
        usuarioId: usuario.id,
        hash: "hash-fake",
        expiraEn: new Date(Date.now() + 60_000),
      },
    });

    expect(token.membresiaId).toBeNull();
    const releido = await prisma.refreshToken.findUnique({ where: { jti: token.jti } });
    expect(releido?.membresiaId).toBeNull();
  });
});

describe("Fase 1 backfill (membership-backfill): mapeo determinístico e idempotente", () => {
  it("crea exactamente una Membresia bootstrap por Usuario con el mapeo fijo por rol", async () => {
    const usuarios = await Promise.all(
      (["ADMINISTRADOR", "SUPERVISOR", "VENDEDOR", "ASESOR"] as const).map((rol) =>
        prisma.usuario.create({
          data: {
            nombre: `Backfill ${rol}`,
            correo: `backfill-${rol.toLowerCase()}-${randomUUID()}@t.local`,
            passwordHash: "x",
            rol,
          },
        }),
      ),
    );
    const usuarioIds = usuarios.map((u) => u.id);

    await ejecutarBackfill();

    const membresias = await testAdminPrisma.membresia.findMany({ where: { usuarioId: { in: usuarioIds } } });
    expect(membresias).toHaveLength(4);

    const porUsuario = new Map(membresias.map((m) => [m.usuarioId, m]));
    for (const usuario of usuarios) {
      const membresia = porUsuario.get(usuario.id);
      expect(membresia).toBeDefined();
      // No holding-wide rows: empresaId nunca null, siempre el bootstrap fijo.
      expect(membresia?.empresaId).toBe(BOOTSTRAP_EMPRESA_ID);
      expect(membresia?.correo).toBeNull();
      expect(membresia?.passwordHash).toBeNull();
      expect(membresia?.activa).toBe(true);

      if (usuario.rol === "ADMINISTRADOR") {
        expect(membresia?.rol).toBe("ADMINISTRADOR");
        expect(membresia?.habilitadoParaVenta).toBe(false);
      } else if (usuario.rol === "SUPERVISOR") {
        expect(membresia?.rol).toBe("SUPERVISOR");
        expect(membresia?.habilitadoParaVenta).toBe(false);
      } else if (usuario.rol === "VENDEDOR") {
        expect(membresia?.rol).toBe("ASESOR");
        expect(membresia?.habilitadoParaVenta).toBe(true);
      } else {
        expect(membresia?.rol).toBe("ASESOR");
        expect(membresia?.habilitadoParaVenta).toBe(false);
      }
    }
  });

  it("re-ejecutar el backfill es idempotente: mismas filas, sin duplicados (Interrupted backfill re-run)", async () => {
    const usuario = await prisma.usuario.create({
      data: {
        nombre: "Idempotencia Test",
        correo: `idempotencia-${randomUUID()}@t.local`,
        passwordHash: "x",
        rol: "ASESOR",
      },
    });

    await ejecutarBackfill();
    const primeraCorrida = await testAdminPrisma.membresia.findMany({ where: { usuarioId: usuario.id } });
    expect(primeraCorrida).toHaveLength(1);

    await ejecutarBackfill();
    await ejecutarBackfill();
    const trasVariasCorridas = await testAdminPrisma.membresia.findMany({ where: { usuarioId: usuario.id } });

    expect(trasVariasCorridas).toHaveLength(1);
    expect(trasVariasCorridas[0]?.id).toBe(primeraCorrida[0]?.id);

    // Tampoco duplica el bootstrap Empresa.
    const empresasBootstrap = await prisma.empresa.findMany({ where: { id: BOOTSTRAP_EMPRESA_ID } });
    expect(empresasBootstrap).toHaveLength(1);
  });

  it("un fallo a mitad de la transacción de backfill revierte TODO (atomicidad, sin estado parcial)", async () => {
    const usuario = await prisma.usuario.create({
      data: {
        nombre: "Rollback Test",
        correo: `rollback-${randomUUID()}@t.local`,
        passwordHash: "x",
        rol: "ASESOR",
      },
    });

    await expect(
      testAdminPrisma.$transaction(async (tx) => {
        await ejecutarBackfill(tx);
        // Corrupción deliberada a mitad de la transacción: un usuario_id
        // inexistente viola la FK `membresias_usuario_id_fkey` y aborta toda
        // la transacción — ninguna escritura previa de este bloque persiste.
        await tx.$executeRawUnsafe(
          `INSERT INTO "membresias" ("id","usuario_id","empresa_id","rol","habilitado_para_venta","activa","creado_en","actualizado_en") VALUES (gen_random_uuid(), gen_random_uuid(), '${BOOTSTRAP_EMPRESA_ID}', 'ASESOR', false, true, now(), now())`,
        );
      }),
    ).rejects.toThrow();

    const membresiaTrasRollback = await testAdminPrisma.membresia.findFirst({
      where: { usuarioId: usuario.id },
    });
    expect(membresiaTrasRollback).toBeNull();
  });
});

