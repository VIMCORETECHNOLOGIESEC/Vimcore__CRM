import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * holding-scoped-tenant-isolation (T2) — static (no database) checks over the
 * migration text. They cannot prove runtime behavior (the DB-backed cases live
 * in adversarial/rls-runtime-matrix.test.ts) but they pin the safety contract
 * of the SQL: additive policies, fail-loud guards, no RLS changes on identity
 * tables, and coverage of every tenant_isolation policy ever created.
 */
const MIGRATIONS_DIR = join(__dirname, "..", "prisma", "migrations");
const MIGRATION_NAME = "20260921150000_holding_scoped_rls";

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
}

const sql = readMigration(MIGRATION_NAME);
// Code without `-- ...` comments, so assertions never match prose.
const code = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

/** Tables named in the spec arrays of the migration (direct + indirect). */
function specTables(): string[] {
  const direct = [...code.matchAll(/^\s*'([a-z_]+)',\s*'(empresa_id|empresa_ingesta_id)'/gm)].map((m) => m[1]!);
  const indirect = [...code.matchAll(/^\s*'([a-z_]+)',\s*\n\s*\$p\$/gm)].map((m) => m[1]!);
  return [...direct, ...indirect];
}

/** Tables that end up with a tenant_isolation policy across all earlier migrations. */
function tenantIsolationTablesInEarlierMigrations(): string[] {
  const tables = new Set<string>();
  for (const dir of readdirSync(MIGRATIONS_DIR).sort()) {
    if (dir >= MIGRATION_NAME) continue;
    let text: string;
    try {
      text = readMigration(dir);
    } catch {
      continue; // migration_lock.toml
    }
    for (const m of text.matchAll(/CREATE POLICY "tenant_isolation" ON "([a-z_]+)"/g)) tables.add(m[1]!);
  }
  return [...tables].sort();
}

describe("holding-scoped RLS migration (static)", () => {
  it("reads the holding GUC through a NULLIF-guarded cast (empty string never errors)", () => {
    expect(code).toContain("app.tenant_holding_id");
    expect(code).toMatch(/NULLIF\(current_setting\('app\.tenant_holding_id', true\), ''\)::uuid/);
    expect(code).not.toMatch(/current_setting\('app\.tenant_holding_id', true\)::uuid/);
  });

  it("defines a STABLE SECURITY INVOKER helper granted to crm_app and not to PUBLIC", () => {
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.app_holding_empresa_ids\(\)/);
    expect(code).toMatch(/LANGUAGE sql\s+STABLE/);
    expect(code).not.toMatch(/SECURITY DEFINER/);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.app_holding_empresa_ids\(\) FROM PUBLIC/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.app_holding_empresa_ids\(\) TO "crm_app"/);
  });

  it("wraps policy creation in a DO block guarded by RAISE EXCEPTION", () => {
    expect(code).toMatch(/DO \$mig\$/);
    expect(code).toMatch(/DROP POLICY IF EXISTS %I ON public\.%I/);
    expect(code).toMatch(/CREATE POLICY %I ON public\.%I AS PERMISSIVE FOR ALL TO PUBLIC USING \(%s\) WITH CHECK \(%s\)/);
    const raises = code.match(/RAISE EXCEPTION/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(5);
    expect(code).toContain("not covered by this migration");
  });

  it("never drops, alters or recreates the existing tenant_isolation policies", () => {
    expect(code).not.toMatch(/DROP POLICY[^;]*tenant_isolation/);
    expect(code).not.toMatch(/ALTER POLICY/);
    expect(code).not.toMatch(/CREATE POLICY[^;]*tenant_isolation/);
    // tenant_isolation only appears as a read-only guard/comment target.
    expect(code).toMatch(/p\.policyname = 'tenant_isolation'/);
  });

  it("does not disable, alter or add row level security on any table", () => {
    expect(code).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(code).not.toMatch(/NO FORCE ROW LEVEL SECURITY/i);
    expect(code).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(code).not.toMatch(/ALTER TABLE[^;]*ROW LEVEL SECURITY/i);
  });

  it("does not touch RLS or policies of empresas, usuarios or holdings", () => {
    for (const table of ["empresas", "usuarios", "holdings"]) {
      expect(specTables()).not.toContain(table);
      expect(code).not.toMatch(new RegExp(`ALTER TABLE\\s+"?${table}"?`, "i"));
      expect(code).not.toMatch(new RegExp(`CREATE POLICY[^;]*ON\\s+"?${table}"?\\b`, "i"));
    }
    // The only mention of empresas is the helper's read-only SELECT.
    expect(code.match(/"empresas"/g)?.length).toBe(1);
  });

  it("covers exactly the tables that have a tenant_isolation policy in earlier migrations", () => {
    const covered = specTables().sort();
    expect(new Set(covered).size).toBe(covered.length);
    expect(covered).toEqual(tenantIsolationTablesInEarlierMigrations());
    expect(covered).toHaveLength(29);
  }, 30_000);

  it("scopes leads_abiertos_revision_pendiente by its own tenant column", () => {
    expect(code).toMatch(/'leads_abiertos_revision_pendiente',\s*'empresa_ingesta_id'/);
  });

  it("adds the holding branch to every empresa comparison of the indirect policies", () => {
    // Each indirect predicate must use the {IN} holding placeholder and never the
    // empresa GUC (which would re-implement the existing branch instead of adding).
    expect(code).not.toContain("app.tenant_empresa_id");
    expect((code.match(/\{IN\}/g) ?? []).length).toBeGreaterThanOrEqual(12);
  });
});
