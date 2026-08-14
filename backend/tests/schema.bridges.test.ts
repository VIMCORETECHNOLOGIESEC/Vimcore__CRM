import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";

/**
 * D-M4 (diseño, tarea PR1.8): verificación de la migración contra la base de
 * pruebas real (ya migrada por `prisma migrate deploy` antes de `pnpm
 * test`), no contra el `schema.prisma` en memoria — para que un `db push`
 * accidental que se saltara la migración no pase inadvertido.
 */
describe("schema M4 — bridges/bridge_logs/leads_recibidos (PR1, migración)", () => {
  it("leads_recibidos tiene UNIQUE(bridge_id, id_externo_lead)", async () => {
    // Prisma emite `CREATE UNIQUE INDEX`, no un `ADD CONSTRAINT ... UNIQUE`
    // (ver migration.sql) — Postgres no registra un índice único simple en
    // `pg_constraint`/`information_schema.table_constraints`, solo en
    // `pg_indexes`. Por eso la verificación va contra `pg_indexes`.
    const indices = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'leads_recibidos' AND indexdef ILIKE '%UNIQUE%'
    `;

    const indiceUnico = indices.find(
      (i) => i.indexdef.includes("bridge_id") && i.indexdef.includes("id_externo_lead"),
    );

    expect(indiceUnico).toBeDefined();
  });

  it("bridges.clave_api_hash es UNIQUE", async () => {
    const indices = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'bridges' AND indexdef ILIKE '%UNIQUE%'
    `;

    const indiceUnico = indices.find((i) => i.indexdef.includes("clave_api_hash"));

    expect(indiceUnico).toBeDefined();
  });

  it("bridge_logs tiene un índice compuesto (bridge_id, ocurrido_en DESC)", async () => {
    const indices = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'bridge_logs'
    `;

    const indiceCompuesto = indices.find(
      (i) => i.indexdef.includes("bridge_id") && i.indexdef.includes("ocurrido_en"),
    );

    expect(indiceCompuesto).toBeDefined();
    expect(indiceCompuesto?.indexdef).toContain("DESC");
  });
});
