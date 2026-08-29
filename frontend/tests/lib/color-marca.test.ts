import { describe, expect, it } from "vitest";
import { estilosDeMarcaPorEmpresa, foregroundForContrast, hexToRgbTriplet } from "@/lib/color-marca";
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

describe("estilosDeMarcaPorEmpresa", () => {
  it("nivel 1 -- sesion company con ambos colores propios seteados devuelve las 8 variables de acento (ignora el holding)", () => {
    const estilos = estilosDeMarcaPorEmpresa(usuarioBase, holdingPersonalizado);
    expect(estilos).toEqual({
      "--primary": "249 115 22",
      "--primary-foreground": "30 42 94",
      "--ring": "249 115 22",
      "--sidebar-primary": "249 115 22",
      "--sidebar-primary-foreground": "30 42 94",
      "--sidebar-accent": "249 115 22",
      "--sidebar-accent-foreground": "30 42 94",
    });
  });

  it("nivel 2 -- sesion holding usa el color EN VIVO de configuracion-empresa cuando llegó", () => {
    const estilos = estilosDeMarcaPorEmpresa(
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
    });
  });

  it("nivel 2 -- empresa sin color propio (nulls) usa el color EN VIVO de configuracion-empresa cuando llegó", () => {
    const estilos = estilosDeMarcaPorEmpresa(
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
    });
  });

  it("nivel 3 -- sesion holding sin config de holding (carga/error de la query) cae al default de fábrica", () => {
    const estilos = estilosDeMarcaPorEmpresa(
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
    });
  });

  it("nivel 3 -- empresa sin color propio y sin config de holding cae al default de fábrica", () => {
    const estilos = estilosDeMarcaPorEmpresa(
      { ...usuarioBase, empresaColorPrimario: null, empresaColorSecundario: null },
      undefined,
    );
    expect(estilos?.["--primary"]).toBe("37 99 235");
  });

  it("usuario null no devuelve overrides (sesion sin resolver todavia)", () => {
    expect(estilosDeMarcaPorEmpresa(null, holdingPersonalizado)).toBeUndefined();
    expect(estilosDeMarcaPorEmpresa(null, undefined)).toBeUndefined();
  });
});
