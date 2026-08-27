import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

/**
 * Bloque C (D4, Fase 2/Stage 2 — cutover bloqueante, task 2.9): verifica la
 * migración `20260827113454_bloque_c_empresa_id_not_null` contra la base de
 * pruebas real (ya aplicada por `prisma migrate deploy` antes de `pnpm
 * test`), mismo patrón que `schema.m5-gestion-leads.test.ts`/
 * `schema.m4-bridges-fundacion.test.ts`. Usa `$executeRawUnsafe` para
 * intentar el INSERT crudo — el cliente Prisma generado ya exige
 * `empresaId` a nivel de TIPOS (ver `CreateLeadData`/`CreateBridgeData`),
 * así que esta prueba confirma la restricción real de la COLUMNA en
 * Postgres, no solo el tipo TypeScript.
 */

afterAll(async () => {
  await prisma.$disconnect();
});

describe("schema Bloque C — empresa_id NOT NULL en leads/bridges (D4, sin backfill)", () => {
  /**
   * Código `23502` = `not_null_violation` (Postgres) — todas las demás
   * columnas llevan `::uuid`/valores válidos explícitos para que la ÚNICA
   * causa posible del rechazo sea la ausencia de `empresa_id`, nunca un
   * error de tipo/cast que probaría otra cosa.
   */
  it("leads.empresa_id es NOT NULL: un INSERT crudo sin empresa_id es rechazado por Postgres (23502, no_null_violation)", async () => {
    const cliente = await prisma.cliente.create({
      data: { nombre: `Cliente NOT NULL ${randomUUID()}`, telefonoValido: false },
    });

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "leads" ("id", "cliente_id", "origen", "etapa", "ingresado_en") VALUES ($1::uuid, $2::uuid, 'NUEVO', 'NUEVO', now())`,
        randomUUID(),
        cliente.id,
      ),
    ).rejects.toThrow(/23502/);
  });

  it("bridges.empresa_id es NOT NULL: un INSERT crudo sin empresa_id es rechazado por Postgres (23502, not_null_violation)", async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "bridges" ("id", "red_social", "nombre", "clave_api_hash", "estado") VALUES ($1::uuid, 'GOOGLE_FORMS', 'Bridge sin empresa', $2, 'INACTIVO')`,
        randomUUID(),
        `hash-${randomUUID()}`,
      ),
    ).rejects.toThrow(/23502/);
  });

  it("un lead/bridge CON empresa_id válida se inserta sin problema (control positivo, no es un guard de más)", async () => {
    const cliente = await prisma.cliente.create({
      data: { nombre: `Cliente con empresa ${randomUUID()}`, telefonoValido: false },
    });
    const leadId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "leads" ("id", "cliente_id", "origen", "etapa", "ingresado_en", "empresa_id") VALUES ($1::uuid, $2::uuid, 'NUEVO', 'NUEVO', now(), $3::uuid)`,
      leadId,
      cliente.id,
      EMPRESA_BOOTSTRAP_ID,
    );
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.empresaId).toBe(EMPRESA_BOOTSTRAP_ID);
  });
});
