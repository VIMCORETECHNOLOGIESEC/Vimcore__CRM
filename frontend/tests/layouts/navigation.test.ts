import { describe, expect, it } from "vitest";
import { NAVIGATION_ITEMS, resolveNavigationHref, resolveNavigationRoute } from "@/layouts/navigation";

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

describe("NAVIGATION_ITEMS -- gate de vista de empresa para holding-wide (Oportunidades/Bridges/Leads/Conversaciones)", () => {
  it("Oportunidades, Bridges, Leads y Conversaciones están marcados con requiereVistaEmpresaSiHolding", () => {
    const oportunidades = NAVIGATION_ITEMS.find((item) => item.label === "Oportunidades");
    const bridges = NAVIGATION_ITEMS.find((item) => item.label === "Bridges");
    const leads = NAVIGATION_ITEMS.find((item) => item.label === "Leads");
    const conversaciones = NAVIGATION_ITEMS.find((item) => item.label === "Conversaciones");
    expect(oportunidades?.requiereVistaEmpresaSiHolding).toBe(true);
    expect(bridges?.requiereVistaEmpresaSiHolding).toBe(true);
    // Bloqueado antes por falta de soporte de `?empresaId=` en `GET /leads`
    // -- ya resuelto en el backend (`leads.access.ts::aplicarFiltroEmpresa`,
    // commit `0ea2742`), mismo criterio que Oportunidades/Bridges.
    expect(leads?.requiereVistaEmpresaSiHolding).toBe(true);
    // WhatsApp Parte 2 (mensajería real): mismo criterio -- un holding-wide
    // no gestiona conversaciones de ninguna empresa en particular sin entrar
    // a la vista de una concreta.
    expect(conversaciones?.requiereVistaEmpresaSiHolding).toBe(true);
  });

  it("Dashboard, Usuarios, Reportes, Apariencia y Empresas no están marcados", () => {
    const sinFlag = NAVIGATION_ITEMS.filter(
      (item) => !["Oportunidades", "Bridges", "Leads", "Conversaciones"].includes(item.label),
    );
    for (const item of sinFlag) {
      expect(item.requiereVistaEmpresaSiHolding).toBeUndefined();
    }
  });
});

describe("resolveNavigationHref", () => {
  const oportunidades = NAVIGATION_ITEMS.find((item) => item.label === "Oportunidades");
  if (!oportunidades) {
    throw new Error("Fixture inválida: NAVIGATION_ITEMS no tiene un ítem 'Oportunidades'");
  }
  const dashboard = NAVIGATION_ITEMS.find((item) => item.label === "Dashboard");
  if (!dashboard) {
    throw new Error("Fixture inválida: NAVIGATION_ITEMS no tiene un ítem 'Dashboard'");
  }

  it("sesión holding sin vista de empresa: devuelve la ruta pelada para un ítem marcado", () => {
    expect(resolveNavigationHref(oportunidades, "holding", null)).toBe("/oportunidades");
  });

  it("sesión holding con vista de empresa activa: agrega ?empresaId= para un ítem marcado", () => {
    expect(resolveNavigationHref(oportunidades, "holding", "empresa-1")).toBe(
      "/oportunidades?empresaId=empresa-1",
    );
  });

  it("sesión company: nunca agrega ?empresaId=, aunque exista un empresaVistaId en la URL", () => {
    expect(resolveNavigationHref(oportunidades, "company", "empresa-1")).toBe("/oportunidades");
  });

  it("un ítem sin requiereVistaEmpresaSiHolding nunca agrega ?empresaId=", () => {
    expect(resolveNavigationHref(dashboard, "holding", "empresa-1")).toBe("/panel");
  });

  it("codifica el id de empresa en la query string", () => {
    expect(resolveNavigationHref(oportunidades, "holding", "empresa con espacio")).toBe(
      "/oportunidades?empresaId=empresa%20con%20espacio",
    );
  });
});
