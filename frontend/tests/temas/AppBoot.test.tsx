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

// Fix "boot desincronizado": `AppBoot` consulta si había un refresh token
// persistido con el MISMO chequeo que `AuthContext.tsx::hadPersistedRefreshToken`
// (`Boolean(getRefreshToken())`) -- se mockea acá para poder simular "hubo
// sesión antes" sin depender de `localStorage` real para ese chequeo puntual.
const getRefreshTokenMock = vi.fn();
vi.mock("@/api/httpClient", () => ({
  getRefreshToken: () => getRefreshTokenMock(),
}));

const { AppBoot } = await import("@/temas/variante-empresarial/AppBoot");
const { MARCA_CONOCIDA_STORAGE_KEY } = await import("@/lib/marca-cache");

beforeEach(() => {
  vi.useFakeTimers();
  // Por defecto, una promesa que nunca resuelve dentro del test -- mismo
  // comportamiento observable que un fetch lento/timeout: la cortina se
  // queda con el default de fábrica durante toda su duración.
  obtenerMarcaPublicaConFallback.mockReturnValue(new Promise(() => {}));
  getRefreshTokenMock.mockReturnValue(null);
  localStorage.removeItem(MARCA_CONOCIDA_STORAGE_KEY);
});

afterEach(() => {
  vi.useRealTimers();
  obtenerMarcaPublicaConFallback.mockReset();
  getRefreshTokenMock.mockReset();
  localStorage.removeItem(MARCA_CONOCIDA_STORAGE_KEY);
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

  /**
   * Fix "boot desincronizado": con un refresh token persistido (hubo sesión
   * antes en este navegador) Y una marca cacheada de esa sesión, la cortina
   * debe pintar ESE branding desde el primer render -- no el default público
   * del holding -- mientras `GET /marca-publica` resuelve en paralelo.
   */
  describe("cache optimista de marca conocida", () => {
    it("con refresh token persistido y marca cacheada, pinta la marca cacheada desde el primer render", () => {
      getRefreshTokenMock.mockReturnValue("refresh-persistido");
      localStorage.setItem(
        MARCA_CONOCIDA_STORAGE_KEY,
        JSON.stringify({
          empresaId: "empresa-a",
          nombre: "Arcano Motos",
          colorPrimario: "#7c2d12",
          colorSecundario: "#f97316",
        }),
      );

      render(
        <AppBoot>
          <div>Contenido de la app</div>
        </AppBoot>,
      );

      expect(screen.getByRole("status")).toHaveTextContent("Arcano Motos");
    });

    it("sin refresh token persistido, ignora la marca cacheada y pinta el default público", () => {
      getRefreshTokenMock.mockReturnValue(null);
      localStorage.setItem(
        MARCA_CONOCIDA_STORAGE_KEY,
        JSON.stringify({
          empresaId: "empresa-a",
          nombre: "Arcano Motos",
          colorPrimario: "#7c2d12",
          colorSecundario: "#f97316",
        }),
      );

      render(
        <AppBoot>
          <div>Contenido de la app</div>
        </AppBoot>,
      );

      expect(screen.getByRole("status")).toHaveTextContent("CRM Embudo de Leads");
    });

    it("con refresh token persistido pero sin marca cacheada, pinta el default público", () => {
      getRefreshTokenMock.mockReturnValue("refresh-persistido");

      render(
        <AppBoot>
          <div>Contenido de la app</div>
        </AppBoot>,
      );

      expect(screen.getByRole("status")).toHaveTextContent("CRM Embudo de Leads");
    });

    it("la marca cacheada es solo el pintado inicial -- la query real (GET /marca-publica) la sigue reemplazando si resuelve antes de ocultarse", async () => {
      getRefreshTokenMock.mockReturnValue("refresh-persistido");
      localStorage.setItem(
        MARCA_CONOCIDA_STORAGE_KEY,
        JSON.stringify({
          empresaId: "empresa-a",
          nombre: "Arcano Motos (cache vieja)",
          colorPrimario: "#7c2d12",
          colorSecundario: "#f97316",
        }),
      );
      obtenerMarcaPublicaConFallback.mockResolvedValue({
        nombre: "Arcano Motos (real)",
        colorPrimario: "#7c2d12",
        colorSecundario: "#f97316",
        logoUrl: null,
      });

      render(
        <AppBoot>
          <div>Contenido de la app</div>
        </AppBoot>,
      );

      expect(screen.getByRole("status")).toHaveTextContent("Arcano Motos (cache vieja)");

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole("status")).toHaveTextContent("Arcano Motos (real)");
    });
  });
});
