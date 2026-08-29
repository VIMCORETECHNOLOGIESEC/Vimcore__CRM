import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/funcionalidades/configuracion-empresa/configuracion-empresa.api", () => ({
  CONFIGURACION_EMPRESA_DEFAULT: {
    nombre: "CRM Embudo de Leads",
    colorPrimario: "#1e2a5e",
    colorSecundario: "#2563eb",
  },
}));

const { AppBoot } = await import("@/temas/variante-empresarial/AppBoot");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
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
});
