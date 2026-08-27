import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma.js";

/**
 * Bloque C (Etapa 3, tarea 1.4) — spec §1 "Policy coverage is complete" +
 * §2 "Only one bypass role exists". Prueba de infraestructura pura contra
 * `pg_class`/`pg_roles`: no depende de AsyncLocalStorage/middleware (grupo
 * 2) — solo confirma que la migración de este cambio dejó la BD en el
 * estado correcto.
 */
const TABLAS_TENANT_SCOPED = [
  "leads",
  "membresias",
  "bridges",
  "citas",
  "lead_eventos",
  "notificaciones",
] as const;

afterAll(async () => {
  await prisma.$disconnect();
});

describe("adversarial/rls-policy-coverage — RLS enabled + forced (spec §1)", () => {
  it.each(TABLAS_TENANT_SCOPED)("%s reporta RLS enabled y forced", async (tabla) => {
    const filas = await prisma.$queryRaw<
      { relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ${tabla}`;

    expect(filas).toHaveLength(1);
    expect(filas[0]?.relrowsecurity).toBe(true);
    expect(filas[0]?.relforcerowsecurity).toBe(true);
  });

  it.each(TABLAS_TENANT_SCOPED)("%s tiene al menos una policy tenant_isolation", async (tabla) => {
    const filas = await prisma.$queryRaw<
      { policyname: string }[]
    >`SELECT policyname FROM pg_policies WHERE tablename = ${tabla}`;

    expect(filas.length).toBeGreaterThanOrEqual(1);
    expect(filas.some((f) => f.policyname === "tenant_isolation")).toBe(true);
  });
});

describe("adversarial/rls-policy-coverage — bypass role único (spec §2)", () => {
  it("crm_bypass_jobs es el único rol con BYPASSRLS", async () => {
    const filas = await prisma.$queryRaw<
      { rolname: string }[]
    >`SELECT rolname FROM pg_roles WHERE rolbypassrls = true`;

    expect(filas.map((f) => f.rolname)).toEqual(["crm_bypass_jobs"]);
  });
});
