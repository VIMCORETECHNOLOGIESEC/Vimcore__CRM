import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { applyTenantGucs, runAsSystem, runWithTenantContext } from "../src/lib/prisma.js";
import { currentTenantContext } from "../src/lib/tenant-context.js";

/**
 * `applyTenantGucs` only needs `$executeRaw`; a fake transaction records the
 * `set_config` calls so GUC selection is verified without a database.
 */
function fakeTx() {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const tx = {
    $executeRaw: vi.fn(async (query: { sql: string; values: unknown[] }) => {
      calls.push({ sql: query.sql, values: query.values });
      return 1;
    }),
  } as unknown as Prisma.TransactionClient;
  return { tx, calls };
}

describe("lib/tenant-context — union scopes", () => {
  it("runWithTenantContext exposes the active variant and clears it afterwards", () => {
    expect(currentTenantContext()).toBeUndefined();
    runWithTenantContext({ holdingId: "holding-1" }, () => {
      expect(currentTenantContext()).toEqual({ holdingId: "holding-1" });
    });
    expect(currentTenantContext()).toBeUndefined();
  });

  it("runAsSystem runs with the explicit unrestricted scope", () => {
    runAsSystem(() => {
      expect(currentTenantContext()).toEqual({ unrestricted: true });
    });
  });
});

describe("lib/prisma — applyTenantGucs picks GUCs per scope", () => {
  it("writes nothing without a context (fail-closed)", async () => {
    const { tx, calls } = fakeTx();
    await applyTenantGucs(tx);
    expect(calls).toHaveLength(0);
  });

  it("company scope sets only app.tenant_empresa_id", async () => {
    const { tx, calls } = fakeTx();
    await runWithTenantContext({ empresaId: "empresa-1" }, () => applyTenantGucs(tx));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("app.tenant_empresa_id");
    expect(calls[0]?.values).toEqual(["empresa-1"]);
  });

  it("holding scope sets app.tenant_holding_id and never the unrestricted bypass", async () => {
    const { tx, calls } = fakeTx();
    await runWithTenantContext({ holdingId: "holding-1" }, () => applyTenantGucs(tx));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("app.tenant_holding_id");
    expect(calls[0]?.sql).not.toContain("tenant_unrestricted");
    expect(calls[0]?.values).toEqual(["holding-1"]);
  });

  it("unrestricted scope sets app.tenant_unrestricted = on", async () => {
    const { tx, calls } = fakeTx();
    await runAsSystem(() => applyTenantGucs(tx));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("app.tenant_unrestricted");
    expect(calls[0]?.sql).toContain("'on'");
  });
});
