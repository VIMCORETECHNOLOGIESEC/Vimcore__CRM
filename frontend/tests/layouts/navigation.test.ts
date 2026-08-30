import { describe, expect, it } from "vitest";
import { NAVIGATION_ITEMS, resolveNavigationRoute } from "@/layouts/navigation";

describe("resolveNavigationRoute", () => {
  const apariencia = NAVIGATION_ITEMS.find((item) => item.label === "Apariencia");
  if (!apariencia) {
    throw new Error("Fixture inválida: NAVIGATION_ITEMS no tiene un ítem 'Apariencia'");
  }

  it("resuelve /configuracion-empresa para scope holding", () => {
    expect(resolveNavigationRoute(apariencia, "holding")).toBe("/configuracion-empresa");
  });

  it("resuelve /apariencia-empresa para scope company", () => {
    expect(resolveNavigationRoute(apariencia, "company")).toBe("/apariencia-empresa");
  });

  it("cae al route de fallback del item cuando el scope es null", () => {
    expect(resolveNavigationRoute(apariencia, null)).toBe(apariencia.route);
  });

  it("cae al route de fallback del item cuando el scope es undefined", () => {
    expect(resolveNavigationRoute(apariencia, undefined)).toBe(apariencia.route);
  });

  it("un item sin routeByScope siempre devuelve su route fijo, sin importar el scope", () => {
    const leads = NAVIGATION_ITEMS.find((item) => item.label === "Leads");
    if (!leads) {
      throw new Error("Fixture inválida: NAVIGATION_ITEMS no tiene un ítem 'Leads'");
    }
    expect(resolveNavigationRoute(leads, "holding")).toBe("/leads");
    expect(resolveNavigationRoute(leads, "company")).toBe("/leads");
  });
});

describe("NAVIGATION_ITEMS -- consolidación de Apariencia", () => {
  it("tiene exactamente un ítem con icono de Apariencia (Palette)", () => {
    const itemsApariencia = NAVIGATION_ITEMS.filter((item) => item.label.startsWith("Apariencia"));
    expect(itemsApariencia).toHaveLength(1);
  });
});

describe("NAVIGATION_ITEMS -- Oportunidades (Bloque D)", () => {
  const oportunidades = NAVIGATION_ITEMS.find((item) => item.label === "Oportunidades");
  if (!oportunidades) {
    throw new Error("Fixture inválida: NAVIGATION_ITEMS no tiene un ítem 'Oportunidades'");
  }

  it("apunta a /oportunidades y es visible para cualquier rol y scope", () => {
    expect(oportunidades.route).toBe("/oportunidades");
    expect(oportunidades.allowedRoles).toBeUndefined();
    expect(oportunidades.allowedScopes).toBeUndefined();
    expect(oportunidades.routeByScope).toBeUndefined();
  });

  it("resuelve /oportunidades para holding y company", () => {
    expect(resolveNavigationRoute(oportunidades, "holding")).toBe("/oportunidades");
    expect(resolveNavigationRoute(oportunidades, "company")).toBe("/oportunidades");
  });
});
