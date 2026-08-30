import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/funcionalidades/configuracion-empresa/configuracion-empresa.api", () => ({
  CONFIGURACION_EMPRESA_DEFAULT: {
    nombre: "CRM Embudo de Leads",
    colorPrimario: "#1e2a5e",
    colorSecundario: "#2563eb",
    logoUrl: null,
  },
}));

// PASO 5 (tema-empresarial-integracion): `AppBoot` ahora dispara
// `obtenerMarcaPublicaConFallback` (GET /marca-publica, sin sesión) al
// montar -- se mockea acá para que la suite nunca dependa de red real y para
// poder controlar cuándo "resuelve" en cada test.
const obtenerMarcaPublicaConFallback = vi.fn();
vi.mock("@/funcionalidades/configuracion-empresa/marca-publica.api", () => ({
  obtenerMarcaPublicaConFallback: () => obtenerMarcaPublicaConFallback(),
}));

const { AppBoot } = await import("@/temas/variante-empresarial/AppBoot");

beforeEach(() => {
  vi.useFakeTimers();
  // Por defecto, una promesa que nunca resuelve dentro del test -- mismo
  // comportamiento observable que un fetch lento/timeout: la cortina se
  // queda con el default de fábrica durante toda su duración.
  obtenerMarcaPublicaConFallback.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  vi.useRealTimers();
  obtenerMarcaPublicaConFallback.mockReset();
});

/**
 * tema-empresarial-integracion (Parte 1): boot de PRODUCCIÓN, sin flag de
 * `import.meta.env.DEV` -- a diferencia de `SelloBootLoader`
 * (`StyleguidePage.tsx`, dev-only). `AppBoot.tsx` fija el total en
 * EXACTAMENTE 1500ms (`SPLASH_SOSTENIDO_MS` 700 + `SPLASH_FADE_MS` 800).
 */
describe("AppBoot", () => {
  it("cubre la pantalla con la cortina de bienvenida por defecto al montar, con children ya asentado detrás", () => {
    render(
      <AppBoot>
        <div>Contenido de la app</div>
      </AppBoot>,
    );

    // Children (App) ya está montado desde el primer render -- mismo criterio
    // "cortina" que FlujoIntegracionDemo.tsx: nunca hay un pop al revelar.
    expect(screen.getByText("Contenido de la app")).toBeInTheDocument();
    const cortina = screen.getByRole("status");
    expect(cortina).toBeInTheDocument();
    expect(cortina).toHaveTextContent("CRM Embudo de Leads");
  });

  it("sigue mostrando la cortina justo antes de los 1500ms y la oculta exactamente a los 1500ms", () => {
    render(
      <AppBoot>
        <div>Contenido de la app</div>
      </AppBoot>,
    );

    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    // El contenido de la app sigue montado -- solo se desmontó la cortina.
    expect(screen.getByText("Contenido de la app")).toBeInTheDocument();
  });

  it("PASO 5 -- actualiza la cortina con la marca pública real si resuelve antes de ocultarse", async () => {
    obtenerMarcaPublicaConFallback.mockResolvedValue({
      nombre: "Arcano Motos",
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: "https://cdn.arcanomotos.com/logo.svg",
    });

    render(
      <AppBoot>
        <div>Contenido de la app</div>
      </AppBoot>,
    );

    // Deja resolver el fetch mockeado (microtarea) sin avanzar timers de la
    // cortina todavía.
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("status")).toHaveTextContent("Arcano Motos");
  });

  it("PASO 5 -- nunca bloquea ni alarga el boot cuando el fetch nunca resuelve (fallback silencioso)", () => {
    render(
      <AppBoot>
        <div>Contenido de la app</div>
      </AppBoot>,
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // La cortina de 1500ms se oculta igual, con el default -- nunca esperó
    // al fetch pendiente.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
