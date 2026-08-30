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
describe("schemas/leads — listLeadsQuerySchema.hasta/desde (M-hardening Bloque A, WU6, spec lead-listing)", () => {
  it("Scenario 'hasta incluye leads creados mas tarde ese mismo dia': hasta=2026-08-20 normaliza a 23:59:59.999Z UTC", () => {
    const resultado = listLeadsQuerySchema.parse({ hasta: "2026-08-20" });

    expect(resultado.hasta).toEqual(new Date("2026-08-20T23:59:59.999Z"));
  });

  it("Scenario 'desde posterior a hasta es rechazado'", () => {
    const resultado = listLeadsQuerySchema.safeParse({ desde: "2026-08-20", hasta: "2026-08-10" });

    expect(resultado.success).toBe(false);
  });

  it("TRIANGULACION: desde === hasta (mismo dia) es aceptado (frontera inclusiva)", () => {
    const resultado = listLeadsQuerySchema.safeParse({ desde: "2026-08-20", hasta: "2026-08-20" });

    expect(resultado.success).toBe(true);
  });

  it("hasta ausente no falla y no normaliza nada", () => {
    const resultado = listLeadsQuerySchema.parse({});

    expect(resultado.hasta).toBeUndefined();
  });
});

describe("schemas/leads — listLeadsQuerySchema.vista (M-hardening Bloque A, WU8, spec lead-listing)", () => {
  it("acepta vista=activos y vista=cerrados", () => {
    expect(listLeadsQuerySchema.safeParse({ vista: "activos" }).success).toBe(true);
    expect(listLeadsQuerySchema.safeParse({ vista: "cerrados" }).success).toBe(true);
  });

  it("omite vista sin error cuando no viene en el query", () => {
    const resultado = listLeadsQuerySchema.parse({});
    expect(resultado.vista).toBeUndefined();
  });

  it("D7: vista=cerrados + estadoSla se rechaza (contradicción — estadoSla solo aplica a leads activos)", () => {
    const resultado = listLeadsQuerySchema.safeParse({ vista: "cerrados", estadoSla: "atrasado" });

    expect(resultado.success).toBe(false);
  });

  it("TRIANGULACION: vista=activos + estadoSla es compatible (la contradicción solo aplica a 'cerrados')", () => {
    const resultado = listLeadsQuerySchema.safeParse({ vista: "activos", estadoSla: "atrasado" });

    expect(resultado.success).toBe(true);
  });

  it("rechaza un valor de vista fuera del enum", () => {
    const resultado = listLeadsQuerySchema.safeParse({ vista: "todos" });

    expect(resultado.success).toBe(false);
  });
});

describe("schemas/leads — listLeadsQuerySchema.limite (M-hardening Bloque A, WU9, spec lead-listing)", () => {
  it("Scenario 'Default applies when omitted': limite omitido resuelve a 25", () => {
    const resultado = listLeadsQuerySchema.parse({});

    expect(resultado.limite).toBe(25);
  });

  it("Scenario 'Non-whitelisted value rejected': limite=20 falla la validación", () => {
    const resultado = listLeadsQuerySchema.safeParse({ limite: "20" });

    expect(resultado.success).toBe(false);
  });

  it("limite=101 (fuera de whitelist) también falla", () => {
    const resultado = listLeadsQuerySchema.safeParse({ limite: "101" });

    expect(resultado.success).toBe(false);
  });

  it.each([10, 25, 50, 100])(
    "Scenario 'Whitelisted values accepted': limite=%i pasa con ese valor exacto",
    (valor) => {
      const resultado = listLeadsQuerySchema.parse({ limite: String(valor) });

      expect(resultado.limite).toBe(valor);
    },
  );

  it("TRIANGULACION: limite=25.5 (no entero) sigue rechazado tras el refine (el .int() previo no queda anulado)", () => {
    const resultado = listLeadsQuerySchema.safeParse({ limite: "25.5" });

    expect(resultado.success).toBe(false);
  });
});

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
