import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request/job tenant scope. Exactly one variant is active at a time:
 * - `{ empresaId }`: company-scoped (`app.tenant_empresa_id`).
 * - `{ holdingId }`: holding-bound; sees only the empresas of that holding.
 * - `{ unrestricted: true }`: system jobs / SUPER_ADMIN (`app.tenant_unrestricted`).
 * Absence of any context stays the fail-closed state.
 */
export type TenantContext =
  | { empresaId: string }
  | { holdingId: string }
  | { unrestricted: true };

const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(context: TenantContext, fn: () => T): T {
  return tenantContextStorage.run(context, fn);
}

/**
 * Explicit unrestricted scope for system jobs, OAuth callbacks and webhooks
 * that must span every tenant through the application role.
 */
export function runAsSystem<T>(fn: () => T): T {
  return runWithTenantContext({ unrestricted: true }, fn);
}

export function currentTenantContext(): TenantContext | undefined {
  return tenantContextStorage.getStore();
}
