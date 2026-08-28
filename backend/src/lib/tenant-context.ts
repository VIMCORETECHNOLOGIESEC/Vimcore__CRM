import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContext {
  empresaId: string | null;
}

const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(context: TenantContext, fn: () => T): T {
  return tenantContextStorage.run(context, fn);
}

export function currentTenantContext(): TenantContext | undefined {
  return tenantContextStorage.getStore();
}
