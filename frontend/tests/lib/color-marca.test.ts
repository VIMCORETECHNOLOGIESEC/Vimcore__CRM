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

describe("estilosDeMarcaPorEmpresa", () => {
  it("sesion company con ambos colores seteados devuelve las 8 variables de acento", () => {
    const estilos = estilosDeMarcaPorEmpresa(usuarioBase);
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

  it("sesion holding no devuelve overrides -- usa la paleta global sin cambios", () => {
    expect(
      estilosDeMarcaPorEmpresa({
        ...usuarioBase,
        sessionScope: "holding",
        empresaId: null,
        empresaNombre: null,
        empresaColorPrimario: null,
        empresaColorSecundario: null,
      }),
    ).toBeUndefined();
  });

  it("empresa sin color propio (nulls) no devuelve overrides", () => {
    expect(
      estilosDeMarcaPorEmpresa({
        ...usuarioBase,
        empresaColorPrimario: null,
        empresaColorSecundario: null,
      }),
    ).toBeUndefined();
  });

  it("usuario null no devuelve overrides", () => {
    expect(estilosDeMarcaPorEmpresa(null)).toBeUndefined();
  });
});
