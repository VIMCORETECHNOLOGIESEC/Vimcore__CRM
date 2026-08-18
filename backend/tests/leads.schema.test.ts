import { describe, expect, it } from "vitest";
import { asignarLoteBodySchema, listLeadsQuerySchema } from "../src/schemas/leads.schema.js";

/**
 * spec ("Búsqueda libre sobre datos de cliente"): `busqueda` es un query
 * param opcional de texto libre. Prueba unitaria pura del schema Zod (sin
 * BD) — mismo criterio del resto del proyecto: los demás filtros de
 * `listLeadsQuerySchema` solo se prueban indirectamente vía
 * `leads.routes.test.ts`; este archivo aísla la validación de `busqueda`
 * porque el `apply-progress` de esta unidad la exige por separado (tarea
 * 1.4/1.5).
 *
 * Nota de convención: el `tasks.md` de la fase pedía colocar este archivo en
 * `src/schemas/leads.schema.test.ts`, pero `vitest.config.ts` solo incluye
 * `tests/**\/*.test.ts` — se sigue la convención real del repo (test
 * colocado en `backend/tests/`), no la ruta aspiracional de la tarea.
 */
describe("schemas/leads — listLeadsQuerySchema.busqueda (spec: Búsqueda libre sobre datos de cliente)", () => {
  it("acepta busqueda como string opcional y la deja pasar tal cual", () => {
    const resultado = listLeadsQuerySchema.safeParse({ busqueda: "3001234567" });

    expect(resultado.success).toBe(true);
    expect(resultado.success && resultado.data.busqueda).toBe("3001234567");
  });

  it("omite busqueda sin error cuando no viene en el query", () => {
    const resultado = listLeadsQuerySchema.safeParse({});

    expect(resultado.success).toBe(true);
    expect(resultado.success && resultado.data.busqueda).toBeUndefined();
  });

  it("rechaza busqueda vacía (string en blanco tras trim)", () => {
    const resultado = listLeadsQuerySchema.safeParse({ busqueda: "   " });

    expect(resultado.success).toBe(false);
  });
});

/**
 * design D-A1 ("Tamaño máximo = 100"): derivado estructuralmente de
 * `listLeadsQuerySchema.limite.max(100)` — "seleccionar toda la página
 * visible" siempre cabe en un request. `asesorId` (no `responsableId`,
 * simetría con `asignarBodySchema`) es opcional: activa `selectResponsable`
 * por lead cuando se omite.
 */
describe("schemas/leads — asignarLoteBodySchema (design D-A1: tamaño de lote y duplicados)", () => {
  function uuids(n: number): string[] {
    return Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  }

  it("acepta un lote de 1 a 100 leadIds sin duplicados, con asesorId opcional", () => {
    const resultado = asignarLoteBodySchema.safeParse({ leadIds: uuids(100) });

    expect(resultado.success).toBe(true);
  });

  it("acepta un lote con asesorId explícito", () => {
    const resultado = asignarLoteBodySchema.safeParse({
      leadIds: uuids(2),
      asesorId: "00000000-0000-4000-8000-999999999999",
    });

    expect(resultado.success).toBe(true);
    expect(resultado.success && resultado.data.asesorId).toBe("00000000-0000-4000-8000-999999999999");
  });

  it("rechaza un lote de 101 leadIds (excede el máximo derivado de limite.max)", () => {
    const resultado = asignarLoteBodySchema.safeParse({ leadIds: uuids(101) });

    expect(resultado.success).toBe(false);
  });

  it("rechaza leadIds duplicados dentro del mismo lote", () => {
    const repetido = uuids(1)[0] as string;
    const resultado = asignarLoteBodySchema.safeParse({ leadIds: [repetido, repetido] });

    expect(resultado.success).toBe(false);
  });

  it("rechaza una lista vacía", () => {
    const resultado = asignarLoteBodySchema.safeParse({ leadIds: [] });

    expect(resultado.success).toBe(false);
  });
});
