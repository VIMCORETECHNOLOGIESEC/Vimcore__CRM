import { afterEach, describe, expect, it, vi } from "vitest";
import { foregroundForContrast, hexToRgbTriplet } from "@/lib/color-marca";
import {
  updateFavicon,
  updateThemeColor,
  drawFaviconLetter,
  generateFaviconLetterDataUri,
  inicialMarca,
  resolveFaviconHref,
  type CanvasFavicon,
} from "@/lib/favicon-marca";

/** Color de texto esperado sobre un fondo dado, calculado con la MISMA
 * `foregroundForContrast` que `favicon-marca.ts` reusa (nunca hardcodeado
 * acá): esa función está en refactor activo en paralelo (otro agente,
 * `color-marca.ts`), así que fijar un triplete literal de más acoplaría
 * este test a un detalle interno que no es responsabilidad de este
 * archivo -- el comportamiento a probar es "usa el color de mayor
 * contraste que devuelva `foregroundForContrast`", no un valor puntual. */
function textoEsperado(colorHex: string): string {
  return `rgb(${foregroundForContrast(hexToRgbTriplet(colorHex)).split(" ").join(", ")})`;
}

/**
 * Pestaña dinámica (color de marca en `theme-color` + favicon con la
 * inicial de la empresa cuando no hay logo). Vive en `lib/` (no en
 * `layouts/AppLayout.tsx`) precisamente para poder probar la lógica sin
 * montar el shell completo (auth, router, `SidebarProvider`, etc.) -- el
 * `useEffect` de `AppLayout.tsx` es una capa fina que solo llama a estas
 * funciones puras/DOM-injectables con los valores ya resueltos por
 * `color-marca.ts`.
 *
 * `drawFaviconLetter`/`generateFaviconLetterDataUri` reciben un "canvas"
 * inyectado (`CanvasFavicon`) en vez de crear uno real con
 * `document.createElement("canvas")` -- jsdom (entorno de este proyecto,
 * ver `vitest.config.ts`) NO implementa `getContext("2d")` sin el paquete
 * nativo `canvas` (no instalado, y agregarlo requeriría declarar una
 * dependencia nueva, AGENTS.md §2.1). La inyección evita ese bloqueo sin
 * mockear canvas: se prueba que las funciones invocan la API 2D correcta
 * (arc/fill/fillText) con los valores de contraste correctos, dejando la
 * implementación real (`crearCanvasReal`, no exportada) para el navegador.
 */

function crearCanvasFalso(overrides?: { getContext?: () => unknown }) {
  const ctx = {
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
  };
  const toDataURL = vi.fn(() => "data:image/png;base64,FAKE");
  const canvas: CanvasFavicon = {
    width: 64,
    height: 64,
    getContext: overrides?.getContext ?? (() => ctx as unknown as CanvasRenderingContext2D),
    toDataURL,
  };
  return { canvas, ctx, toDataURL };
}

describe("inicialMarca", () => {
  it("devuelve la primera letra en mayúscula", () => {
    expect(inicialMarca("Empresa Test")).toBe("E");
  });

  it("recorta espacios antes de tomar la primera letra", () => {
    expect(inicialMarca("  vimcore")).toBe("V");
  });

  it("cae a 'I' cuando el nombre está vacío", () => {
    expect(inicialMarca("")).toBe("I");
    expect(inicialMarca("   ")).toBe("I");
  });
});

describe("drawFaviconLetter", () => {
  it("dibuja un círculo con el color de marca de fondo y la letra en el color de mayor contraste", () => {
    const { canvas, ctx } = crearCanvasFalso();
    const resultado = drawFaviconLetter(canvas, "E", "#f97316");

    expect(ctx.arc).toHaveBeenCalledTimes(1);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.fillText).toHaveBeenCalledWith("E", 32, 32);
    // fillStyle se pisa dos veces: fondo primero, texto después -- el valor
    // final leído es el del texto, que debe ser el de mayor contraste
    // (`foregroundForContrast`, calculado arriba, no hardcodeado acá).
    expect(ctx.fillStyle).toBe(textoEsperado("#f97316"));
    expect(resultado).toBe("data:image/png;base64,FAKE");
  });

  it("resuelve el color de texto con foregroundForContrast también para un fondo oscuro de marca", () => {
    const { canvas, ctx } = crearCanvasFalso();
    drawFaviconLetter(canvas, "V", "#1e2a5e");
    expect(ctx.fillStyle).toBe(textoEsperado("#1e2a5e"));
  });

  it("devuelve cadena vacía si el canvas no puede dar un contexto 2d (entorno sin soporte)", () => {
    const { canvas } = crearCanvasFalso({ getContext: () => null });
    expect(drawFaviconLetter(canvas, "E", "#1e2a5e")).toBe("");
  });
});

describe("generateFaviconLetterDataUri", () => {
  it("usa la inicial del nombre de marca y devuelve el data URI del canvas inyectado", () => {
    const { canvas, ctx, toDataURL } = crearCanvasFalso();
    const resultado = generateFaviconLetterDataUri("Empresa Test", "#f97316", () => canvas);
    expect(ctx.fillText).toHaveBeenCalledWith("E", 32, 32);
    expect(toDataURL).toHaveBeenCalledWith("image/png");
    expect(resultado).toBe("data:image/png;base64,FAKE");
  });
});

describe("resolveFaviconHref", () => {
  it("usa el logo real de la empresa cuando existe, sin generar el favicon con canvas", () => {
    const fabricaCanvas = vi.fn();
    const resultado = resolveFaviconHref(
      "https://cdn.empresa-a.com/logo.svg",
      "Empresa Test",
      "#f97316",
      fabricaCanvas,
    );
    expect(resultado).toBe("https://cdn.empresa-a.com/logo.svg");
    expect(fabricaCanvas).not.toHaveBeenCalled();
  });

  it("genera el favicon con la inicial cuando la empresa no tiene logo", () => {
    const { canvas } = crearCanvasFalso();
    const resultado = resolveFaviconHref(null, "Empresa Test", "#f97316", () => canvas);
    expect(resultado).toBe("data:image/png;base64,FAKE");
  });
});

describe("updateThemeColor", () => {
  afterEach(() => {
    document.querySelector('meta[name="theme-color"]')?.remove();
  });

  it("crea el meta tag si todavía no existe", () => {
    expect(document.querySelector('meta[name="theme-color"]')).toBeNull();
    updateThemeColor("#7c2d12");
    const meta = document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute("content")).toBe("#7c2d12");
  });

  it("actualiza el meta tag existente en vez de duplicarlo", () => {
    updateThemeColor("#7c2d12");
    updateThemeColor("#134e4a");
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    expect(metas).toHaveLength(1);
    expect(metas[0]?.getAttribute("content")).toBe("#134e4a");
  });
});

describe("updateFavicon", () => {
  afterEach(() => {
    document.querySelector('link[rel="icon"]')?.remove();
  });

  it("crea el link[rel=icon] si todavía no existe", () => {
    expect(document.querySelector('link[rel="icon"]')).toBeNull();
    updateFavicon("https://cdn.empresa-a.com/logo.svg");
    const link = document.querySelector('link[rel="icon"]');
    expect(link?.getAttribute("href")).toBe("https://cdn.empresa-a.com/logo.svg");
  });

  it("actualiza el link existente en vez de duplicarlo", () => {
    updateFavicon("https://cdn.empresa-a.com/logo.svg");
    updateFavicon("data:image/png;base64,FAKE");
    const links = document.querySelectorAll('link[rel="icon"]');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("data:image/png;base64,FAKE");
  });
});
