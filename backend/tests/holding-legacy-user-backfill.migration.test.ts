import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * holding-scoped-tenant-isolation (T5c) — static (no database) checks over the
 * legacy-user backfill migration text. They cannot prove runtime behavior (the
 * SQL was never executed here) but pin its safety contract: only legacy
 * holding-wide roles with a NULL holding are touched, ambiguity aborts loudly,
 * and no RLS/policy/schema statement is issued.
 */
const MIGRATIONS_DIR = join(__dirname, "..", "prisma", "migrations");
const sql = readFileSync(
  join(MIGRATIONS_DIR, "20260921160000_holding_legacy_user_backfill", "migration.sql"),
  "utf8",
);
// Code without `-- ...` comments, so assertions never match prose.
const code = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("migration 20260921160000_holding_legacy_user_backfill (static)", () => {
  it("sorts after the holding-scoped RLS migration", () => {
    expect("20260921160000_holding_legacy_user_backfill" > "20260921150000_holding_scoped_rls").toBe(true);
  });

  it("only UPDATEs usuarios.holding_id, restricted to legacy roles with a NULL holding", () => {
    const updates = [...code.matchAll(/UPDATE\s+"(\w+)"/g)].map((m) => m[1]);
    expect(updates).toEqual(["usuarios"]);
    expect(code).toMatch(/SET\s+"holding_id"\s*=\s*r\."holding_id"/);
    expect(code).toMatch(/u\."rol" IN \('ADMINISTRADOR', 'SUPERVISOR'\)\s+AND u\."holding_id" IS NULL/);
    // Never touches other columns, roles, or tables' data.
    expect(code).not.toMatch(/\bINSERT\b|\bDELETE\b|\bTRUNCATE\b/);
    expect(code).not.toMatch(/SET\s+"rol"/);
  });

  it("links only when exactly one distinct non-null holding is reachable through membresias/empresas", () => {
    expect(code).toMatch(/JOIN "empresas" e ON e\."id" = m\."empresa_id"/);
    expect(code).toMatch(/e\."holding_id" IS NOT NULL/);
    expect(code).toMatch(/HAVING count\(DISTINCT e\."holding_id"\) = 1/);
  });

  it("aborts loudly on ambiguity (more than one holding) before updating anything", () => {
    const guard = code.indexOf("HAVING count(DISTINCT e.\"holding_id\") > 1");
    const raise = code.indexOf("RAISE EXCEPTION");
    const update = code.indexOf('UPDATE "usuarios"');
    expect(guard).toBeGreaterThan(-1);
    expect(raise).toBeGreaterThan(guard);
    expect(update).toBeGreaterThan(raise);
  });

  it("only NOTICEs (fail-closed) for users that cannot be resolved", () => {
    expect(code).toMatch(/RAISE NOTICE/);
    expect(code.match(/RAISE EXCEPTION/g)).toHaveLength(1);
  });

  it("sets the transaction-local unrestricted GUC because membresias has FORCE RLS", () => {
    expect(code).toMatch(/set_config\('app\.tenant_unrestricted', 'on', true\)/);
  });

  it("does not alter RLS, policies, or the schema", () => {
    expect(code).not.toMatch(/\bPOLICY\b|ROW LEVEL SECURITY|\bALTER\b|\bCREATE\b|\bDROP\b|\bGRANT\b|\bREVOKE\b/i);
  });
});
