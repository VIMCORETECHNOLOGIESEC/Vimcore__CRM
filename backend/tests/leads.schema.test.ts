import { describe, expect, it } from "vitest";
import { listLeadsQuerySchema } from "../src/schemas/leads.schema.js";

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
