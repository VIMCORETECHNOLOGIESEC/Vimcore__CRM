import { describe, expect, it } from "vitest";
import {
  resolveEstilosMarca,
  foregroundForContrast,
  hexToRgbTriplet,
  resolveLogoMarca,
  resolveMarcaCompleta,
  resolveNombreMarca,
} from "@/lib/color-marca";
import type { AuthenticatedUser } from "@/tipos/usuario";

const usuarioBase: AuthenticatedUser = {
  id: "u1",
  nombre: "Test",
  correo: "test@crm.local",
  rol: "ADMINISTRADOR",
  sessionScope: "company",
  empresaId: "e1",
  empresaNombre: "Empresa Test",
  empresaColorPrimario: "#7c2d12",
  empresaColorSecundario: "#f97316",
  empresaLogoUrl: null,
};

describe("hexToRgbTriplet", () => {
  it("convierte un hex de 6 dígitos al formato triplete que usan las variables shadcn", () => {
    expect(hexToRgbTriplet("#7c2d12")).toBe("124 45 18");
  });

  it("funciona con hex en mayúsculas", () => {
    expect(hexToRgbTriplet("#F97316")).toBe("249 115 22");
  });

  it("funciona sin el símbolo #", () => {
    expect(hexToRgbTriplet("065f46")).toBe("6 95 70");
  });
});

describe("foregroundForContrast", () => {
  it("elige blanco sobre un fondo oscuro que ya cumple 4.5:1 con blanco", () => {
    // --vimcore-accent actual (37 99 235): ya validado en index.css a 5.2:1 con blanco.
    expect(foregroundForContrast("37 99 235")).toBe("255 255 255");
  });

  it("elige el texto oscuro del tema sobre un naranja claro que no cumple 4.5:1 con blanco", () => {
    // Empresa A demo (#f97316): blanco da ~2.8:1, falla AA -- debe caer al oscuro.
    expect(foregroundForContrast("249 115 22")).toBe("30 42 94");
  });

  it("elige el texto oscuro del tema sobre un verde esmeralda que no cumple 4.5:1 con blanco", () => {
    // Empresa B demo (#10b981): blanco da ~2.5:1, falla AA -- debe caer al oscuro.
    expect(foregroundForContrast("16 185 129")).toBe("30 42 94");
  });
});

const holdingPersonalizado = { colorPrimario: "#134e4a", colorSecundario: "#10b981" };

describe("resolveEstilosMarca", () => {
  it("nivel 1 -- sesion company con ambos colores propios seteados devuelve las 12 variables de acento (ignora el holding)", () => {
    const estilos = resolveEstilosMarca(usuarioBase, holdingPersonalizado);
    expect(estilos).toEqual({
      "--primary": "249 115 22",
      "--primary-foreground": "30 42 94",
      "--ring": "249 115 22",
      "--sidebar-primary": "249 115 22",
      "--sidebar-primary-foreground": "30 42 94",
      "--sidebar-accent": "249 115 22",
      "--sidebar-accent-foreground": "30 42 94",
      // --sidebar* deriva de colorPrimario (#7c2d12 -> "124 45 18"), no de colorSecundario.
      "--sidebar": "124 45 18",
      "--sidebar-foreground": "255 255 255",
      "--sidebar-border": "255 255 255",
      "--sidebar-ring": "255 255 255",
    });
  });

  it("nivel 1 -- colorPrimario claro hace que --sidebar-foreground/border/ring caigan al texto oscuro del tema (WCAG AA)", () => {
    // #fafaf5 ("250 250 245"): blanco da ~1.02:1, falla AA -- debe caer al
    // oscuro, mismo caso límite que ya se prueba arriba para colorSecundario
    // en `foregroundForContrast`, ahora sobre el camino de --sidebar*.
    const usuario = { ...usuarioBase, empresaColorPrimario: "#fafaf5" };
    const estilos = resolveEstilosMarca(usuario, holdingPersonalizado);
    expect(estilos?.["--sidebar"]).toBe("250 250 245");
    expect(estilos?.["--sidebar-foreground"]).toBe("30 42 94");
    expect(estilos?.["--sidebar-border"]).toBe("30 42 94");
    expect(estilos?.["--sidebar-ring"]).toBe("30 42 94");
  });

  it("nivel 2 -- sesion holding usa el color EN VIVO de configuracion-empresa cuando llegó", () => {
    const estilos = resolveEstilosMarca(
      { ...usuarioBase, sessionScope: "holding", empresaId: null, empresaNombre: null, empresaColorPrimario: null, empresaColorSecundario: null },
      holdingPersonalizado,
    );
    expect(estilos).toEqual({
      "--primary": "16 185 129",
      "--primary-foreground": "30 42 94",
      "--ring": "16 185 129",
      "--sidebar-primary": "16 185 129",
      "--sidebar-primary-foreground": "30 42 94",
      "--sidebar-accent": "16 185 129",
      "--sidebar-accent-foreground": "30 42 94",
      // holdingPersonalizado.colorPrimario = "#134e4a" -> "19 78 74".
      "--sidebar": "19 78 74",
      "--sidebar-foreground": "255 255 255",
      "--sidebar-border": "255 255 255",
      "--sidebar-ring": "255 255 255",
    });
  });

  it("nivel 2 -- empresa sin color propio (nulls) usa el color EN VIVO de configuracion-empresa cuando llegó", () => {
    const estilos = resolveEstilosMarca(
      { ...usuarioBase, empresaColorPrimario: null, empresaColorSecundario: null },
      holdingPersonalizado,
    );
    expect(estilos).toEqual({
      "--primary": "16 185 129",
      "--primary-foreground": "30 42 94",
      "--ring": "16 185 129",
      "--sidebar-primary": "16 185 129",
      "--sidebar-primary-foreground": "30 42 94",
      "--sidebar-accent": "16 185 129",
      "--sidebar-accent-foreground": "30 42 94",
      "--sidebar": "19 78 74",
      "--sidebar-foreground": "255 255 255",
      "--sidebar-border": "255 255 255",
      "--sidebar-ring": "255 255 255",
    });
  });

  it("nivel 3 -- sesion holding sin config de holding (carga/error de la query) cae al default de fábrica", () => {
    const estilos = resolveEstilosMarca(
      { ...usuarioBase, sessionScope: "holding", empresaId: null, empresaNombre: null, empresaColorPrimario: null, empresaColorSecundario: null },
      undefined,
    );
    expect(estilos).toEqual({
      "--primary": "37 99 235",
      "--primary-foreground": "255 255 255",
      "--ring": "37 99 235",
      "--sidebar-primary": "37 99 235",
      "--sidebar-primary-foreground": "255 255 255",
      "--sidebar-accent": "37 99 235",
      "--sidebar-accent-foreground": "255 255 255",
      // CONFIGURACION_EMPRESA_DEFAULT.colorPrimario = "--vimcore" = "30 42 94".
      "--sidebar": "30 42 94",
      "--sidebar-foreground": "255 255 255",
      "--sidebar-border": "255 255 255",
      "--sidebar-ring": "255 255 255",
    });
  });

  it("nivel 3 -- empresa sin color propio y sin config de holding cae al default de fábrica", () => {
    const estilos = resolveEstilosMarca(
      { ...usuarioBase, empresaColorPrimario: null, empresaColorSecundario: null },
      undefined,
    );
    expect(estilos?.["--primary"]).toBe("37 99 235");
  });

  it("usuario null no devuelve overrides (sesion sin resolver todavia)", () => {
    expect(resolveEstilosMarca(null, holdingPersonalizado)).toBeUndefined();
    expect(resolveEstilosMarca(null, undefined)).toBeUndefined();
  });
});

describe("resolveLogoMarca (PASO 6)", () => {
  const holdingConLogo = { logoUrl: "https://cdn.holding.com/logo.svg" };

  it("nivel 1 -- sesion company con isotipo propio ignora el del holding", () => {
    const usuario = { ...usuarioBase, empresaLogoUrl: "https://cdn.empresa-a.com/logo.svg" };
    expect(resolveLogoMarca(usuario, holdingConLogo)).toBe("https://cdn.empresa-a.com/logo.svg");
  });

  it("nivel 2 -- empresa sin isotipo propio usa el del holding EN VIVO", () => {
    expect(resolveLogoMarca(usuarioBase, holdingConLogo)).toBe("https://cdn.holding.com/logo.svg");
  });

  it("nivel 2 -- sesion holding usa el isotipo EN VIVO de configuracion-empresa", () => {
    const usuario = {
      ...usuarioBase,
      sessionScope: "holding" as const,
      empresaId: null,
      empresaNombre: null,
      empresaColorPrimario: null,
      empresaColorSecundario: null,
      empresaLogoUrl: null,
    };
    expect(resolveLogoMarca(usuario, holdingConLogo)).toBe("https://cdn.holding.com/logo.svg");
  });

  it("nivel 3 -- sin isotipo propio y sin isotipo de holding devuelve null (nunca un ícono genérico)", () => {
    expect(resolveLogoMarca(usuarioBase, { logoUrl: null })).toBeNull();
    expect(resolveLogoMarca(usuarioBase, undefined)).toBeNull();
  });

  it("usuario null devuelve null (sesion sin resolver todavia)", () => {
    expect(resolveLogoMarca(null, holdingConLogo)).toBeNull();
  });
});

describe("resolveNombreMarca (PASO 7)", () => {
  const holdingConNombre = { nombre: "Holding En Vivo" };

  it("nivel 1 -- sesion company usa su propio empresaNombre", () => {
    expect(resolveNombreMarca(usuarioBase, holdingConNombre)).toBe("Empresa Test");
  });

  it("nivel 2 -- sesion holding usa el nombre EN VIVO de configuracion-empresa", () => {
    const usuario = { ...usuarioBase, sessionScope: "holding" as const, empresaNombre: null };
    expect(resolveNombreMarca(usuario, holdingConNombre)).toBe("Holding En Vivo");
  });

  it("nivel 3 -- sin nombre de sesion y sin config de holding cae al default de fábrica", () => {
    const usuario = { ...usuarioBase, sessionScope: "holding" as const, empresaNombre: null };
    expect(resolveNombreMarca(usuario, undefined)).toBe("CRM Embudo de Leads");
  });

  it("usuario null cae al default de fábrica", () => {
    expect(resolveNombreMarca(null, undefined)).toBe("CRM Embudo de Leads");
    expect(resolveNombreMarca(null, holdingConNombre)).toBe("Holding En Vivo");
  });
});

/**
 * Fix real (splash post-login duplicado con un dato mal cada vez): unifica
 * en un solo objeto plano `{ nombre, "--marca-color-1", "--marca-color-2" }`
 * -- exactamente las 3 variables que `WelcomeSplashLoader.tsx`/
 * `tema-empresarial.css` (`.welcome-splash`) consumen para pintar el splash,
 * a diferencia de `resolveEstilosMarca` (tokens shadcn del shell, en
 * triplete RGB, no hex). Antes `LoginPage.tsx` tenía su propia
 * `resolveColorMarca` local que nunca resolvía `nombre` (venía del holding
 * global) y `AppLayout.tsx` no seteaba estas variables en absoluto.
 */
describe("resolveMarcaCompleta (fix splash duplicado)", () => {
  const holdingCompleto = {
    nombre: "Holding En Vivo",
    colorPrimario: "#134e4a",
    colorSecundario: "#10b981",
  };

  it("nivel 1 -- sesion company con nombre y colores propios seteados devuelve los 3 campos de la Empresa (ignora el holding)", () => {
    expect(resolveMarcaCompleta(usuarioBase, holdingCompleto)).toEqual({
      nombre: "Empresa Test",
      "--marca-color-1": "#7c2d12",
      "--marca-color-2": "#f97316",
    });
  });

  it("nivel 2 -- sesion holding usa nombre y colores EN VIVO de configuracion-empresa", () => {
    const usuario = {
      ...usuarioBase,
      sessionScope: "holding" as const,
      empresaId: null,
      empresaNombre: null,
      empresaColorPrimario: null,
      empresaColorSecundario: null,
    };
    expect(resolveMarcaCompleta(usuario, holdingCompleto)).toEqual({
      nombre: "Holding En Vivo",
      "--marca-color-1": "#134e4a",
      "--marca-color-2": "#10b981",
    });
  });

  it("nivel 2 -- empresa sin color propio (nulls) usa los colores EN VIVO del holding aunque tenga nombre propio", () => {
    const usuario = { ...usuarioBase, empresaColorPrimario: null, empresaColorSecundario: null };
    expect(resolveMarcaCompleta(usuario, holdingCompleto)).toEqual({
      // empresaNombre sigue seteado -- nivel 1 de resolveNombreMarca no depende de los colores.
      nombre: "Empresa Test",
      "--marca-color-1": "#134e4a",
      "--marca-color-2": "#10b981",
    });
  });

  it("nivel 3 -- sesion holding sin config de holding (carga/error de la query) cae al default de fábrica", () => {
    const usuario = {
      ...usuarioBase,
      sessionScope: "holding" as const,
      empresaId: null,
      empresaNombre: null,
      empresaColorPrimario: null,
      empresaColorSecundario: null,
    };
    expect(resolveMarcaCompleta(usuario, undefined)).toEqual({
      nombre: "CRM Embudo de Leads",
      "--marca-color-1": "#1e2a5e",
      "--marca-color-2": "#2563eb",
    });
  });

  it("usuario null cae al default de fábrica para las 3 variables", () => {
    expect(resolveMarcaCompleta(null, undefined)).toEqual({
      nombre: "CRM Embudo de Leads",
      "--marca-color-1": "#1e2a5e",
      "--marca-color-2": "#2563eb",
    });
  });
});
