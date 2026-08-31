import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { foregroundForContrast, hexToRgbTriplet } from "@/lib/color-marca";

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/funcionalidades/configuracion-empresa/useConfiguracionEmpresa", () => ({
  useConfiguracionEmpresa: vi.fn(),
}));
// Componentes pesados del shell real -- irrelevantes para lo que este test
// verifica (el gate del splash), cada uno ya tiene su propia cobertura.
vi.mock("@/components/app-sidebar", () => ({
  AppSidebar: () => <div data-testid="app-sidebar" />,
}));
vi.mock("../../src/layouts/Header", () => ({
  Header: () => <div data-testid="app-header" />,
}));
let latestColorAcento: string | undefined;
vi.mock("@/funcionalidades/leads/tutorial/LeadsNavigationTutorial", () => ({
  LeadsNavigationTutorialProvider: ({
    children,
    colorAcento,
  }: {
    children: React.ReactNode;
    colorAcento?: string;
  }) => {
    latestColorAcento = colorAcento;
    return children;
  },
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { useConfiguracionEmpresa } = await import(
  "@/funcionalidades/configuracion-empresa/useConfiguracionEmpresa"
);
const { AppLayout } = await import("@/layouts/AppLayout");

const useAuthMock = vi.mocked(useAuth);
const useConfiguracionEmpresaMock = vi.mocked(useConfiguracionEmpresa);

const usuarioFake = {
  id: "u1",
  nombre: "Ana",
  correo: "ana@crm.test",
  rol: "ASESOR" as const,
  sessionScope: "holding" as const,
  empresaId: null,
  empresaNombre: null,
  empresaColorPrimario: null,
  empresaColorSecundario: null,
  empresaLogoUrl: null,
};

function renderAppLayout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  latestColorAcento = undefined;
  vi.useFakeTimers();
  useAuthMock.mockReturnValue({
    user: usuarioFake,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: vi.fn(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // Bug 3 (color de marca no llega a portales Radix): el fix escribe
  // custom properties directamente en <html>, que sobreviven al unmount de
  // React Testing Library (solo limpia lo montado bajo `document.body`) --
  // sin este reset, un test dejaría residuo visible para el siguiente.
  document.documentElement.removeAttribute("style");
  // Pestaña dinámica (theme-color + favicon): mismo motivo que arriba --
  // `<meta>`/`<link>` viven en `<head>`, fuera del árbol que RTL desmonta.
  document.querySelector('meta[name="theme-color"]')?.remove();
  document.querySelector('link[rel="icon"]')?.remove();
});

describe("AppLayout — gate del splash contra el gap de tema por defecto", () => {
  it("muestra el splash (no el shell real) mientras useConfiguracionEmpresa está cargando", () => {
    useConfiguracionEmpresaMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useConfiguracionEmpresa>);

    renderAppLayout();

    expect(screen.getByText("Cargando tu panel…")).toBeInTheDocument();
    expect(screen.queryByTestId("app-sidebar")).not.toBeInTheDocument();
  });

  it("no revela el shell antes del piso de 1500ms aunque la config ya haya resuelto", () => {
    useConfiguracionEmpresaMock.mockReturnValue({
      data: { nombre: "Holding X", colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null },
      isLoading: false,
    } as ReturnType<typeof useConfiguracionEmpresa>);

    renderAppLayout();

    expect(screen.getByText("Cargando tu panel…")).toBeInTheDocument();
    expect(screen.queryByTestId("app-sidebar")).not.toBeInTheDocument();
  });

  it("revela el shell real al cumplirse el piso de 1500ms, con la config ya resuelta", () => {
    useConfiguracionEmpresaMock.mockReturnValue({
      data: { nombre: "Holding X", colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null },
      isLoading: false,
    } as ReturnType<typeof useConfiguracionEmpresa>);

    renderAppLayout();
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(screen.queryByText("Cargando tu panel…")).not.toBeInTheDocument();
  });

  it("pinta el splash con el color de marca REAL del holding, no el índigo por defecto del tema (bug real: antes se le pasaba resolveEstilosMarca, que el splash no lee)", () => {
    useConfiguracionEmpresaMock.mockReturnValue({
      data: { nombre: "Holding X", colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null },
      isLoading: false,
    } as ReturnType<typeof useConfiguracionEmpresa>);

    renderAppLayout();

    const splash = screen.getByRole("status");
    expect(splash.style.getPropertyValue("--marca-color-1")).toBe("#111111");
    expect(splash.style.getPropertyValue("--marca-color-2")).toBe("#222222");
  });
});

describe("AppLayout — Bug 4: color de marca real llega al tutorial guiado (Joyride)", () => {
  /**
   * Causa raíz: `LeadsNavigationTutorial.tsx` hardcodeaba
   * `options.primaryColor: "#2563EB"` en vez de recibir el color de marca
   * real ya resuelto acá (`marcaSplash["--marca-color-2"]`, misma fuente que
   * pinta el splash de bienvenida).
   */
  it("pasa colorAcento = marcaSplash['--marca-color-2'] al provider del tutorial", () => {
    useConfiguracionEmpresaMock.mockReturnValue({
      data: { nombre: "Holding X", colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null },
      isLoading: false,
    } as ReturnType<typeof useConfiguracionEmpresa>);

    renderAppLayout();
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(latestColorAcento).toBe("#222222");
  });
});

describe("AppLayout — Bug 3: color de marca disponible para portales Radix (tooltip/dropdown/dialog/sheet/select/popover/alert-dialog)", () => {
  /**
   * Causa raíz: `estilosMarca` solo se aplicaba como `style` inline en
   * `SidebarProvider`. Los componentes Radix de este proyecto renderizan vía
   * Portal directo a `document.body`, FUERA de ese subárbol -- nunca
   * heredaban esas variables CSS y caían al `:root` fijo (azul, `--ring: 37
   * 99 235`). Fix: espejar las mismas propiedades en
   * `document.documentElement` (nivel `<html>`), que SÍ es ancestro de
   * cualquier portal montado en `<body>`, sin importar dónde cuelgue.
   */
  it("espeja --primary/--ring/--sidebar-* en <html> al revelar el shell, para que un portal en <body> las herede", () => {
    useConfiguracionEmpresaMock.mockReturnValue({
      data: { nombre: "Holding X", colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null },
      isLoading: false,
    } as ReturnType<typeof useConfiguracionEmpresa>);

    renderAppLayout();
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    const acento = hexToRgbTriplet("#222222");
    const acentoForeground = foregroundForContrast(acento);
    const sidebar = hexToRgbTriplet("#111111");
    const sidebarForeground = foregroundForContrast(sidebar);
    const raiz = document.documentElement.style;

    expect(raiz.getPropertyValue("--primary")).toBe(acento);
    expect(raiz.getPropertyValue("--ring")).toBe(acento);
    expect(raiz.getPropertyValue("--primary-foreground")).toBe(acentoForeground);
    expect(raiz.getPropertyValue("--sidebar-primary")).toBe(acento);
    expect(raiz.getPropertyValue("--sidebar-accent")).toBe(acento);
    expect(raiz.getPropertyValue("--sidebar")).toBe(sidebar);
    expect(raiz.getPropertyValue("--sidebar-foreground")).toBe(sidebarForeground);
  });

  it("limpia las custom properties de <html> al desmontar, para no dejar residuo de una sesión anterior (ej. logout)", () => {
    useConfiguracionEmpresaMock.mockReturnValue({
      data: { nombre: "Holding X", colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null },
      isLoading: false,
    } as ReturnType<typeof useConfiguracionEmpresa>);

    const { unmount } = renderAppLayout();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(document.documentElement.style.getPropertyValue("--primary")).not.toBe("");

    unmount();

    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--sidebar")).toBe("");
  });
});

describe("AppLayout — pestaña dinámica (theme-color + favicon con la marca de la empresa logueada)", () => {
  /**
   * `lib/favicon-marca.ts` ya está probado de forma aislada, sin canvas
   * real (`tests/lib/favicon-marca.test.ts`). Este bloque solo verifica el
   * cableado en `AppLayout.tsx`: que el efecto llame a esas funciones con
   * los valores de marca correctos ya resueltos por `color-marca.ts`.
   */
  it("actualiza <meta name=theme-color> con colorPrimario en cuanto se revela el shell (mismo color que el sidebar)", () => {
    useConfiguracionEmpresaMock.mockReturnValue({
      data: { nombre: "Holding X", colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null },
      isLoading: false,
    } as ReturnType<typeof useConfiguracionEmpresa>);

    renderAppLayout();
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      "#111111",
    );
  });

  it("usa el logo real de la empresa como favicon cuando existe, en vez de generarlo con canvas", () => {
    useConfiguracionEmpresaMock.mockReturnValue({
      data: {
        nombre: "Holding X",
        colorPrimario: "#111111",
        colorSecundario: "#222222",
        logoUrl: "https://cdn.holding.com/logo.svg",
      },
      isLoading: false,
    } as ReturnType<typeof useConfiguracionEmpresa>);

    renderAppLayout();
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(document.querySelector('link[rel="icon"]')?.getAttribute("href")).toBe(
      "https://cdn.holding.com/logo.svg",
    );
  });

  it("intenta generar el favicon con la inicial cuando la empresa no tiene logo (fallback canvas)", () => {
    // Limitación conocida de jsdom (documentada en `favicon-marca.ts` y
    // `tests/lib/favicon-marca.test.ts`): `HTMLCanvasElement.getContext("2d")`
    // no está implementado sin el paquete nativo `canvas` (no instalado a
    // propósito, agregarlo sería una dependencia nueva sin declarar,
    // AGENTS.md §2.1) -- acá solo se confirma que el cableado corre sin
    // romper el render y crea el `<link rel="icon">` (el data URI real con
    // la inicial se prueba de forma aislada e inyectando un canvas falso en
    // `tests/lib/favicon-marca.test.ts`, donde SÍ se verifica su contenido).
    useConfiguracionEmpresaMock.mockReturnValue({
      data: { nombre: "Holding X", colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null },
      isLoading: false,
    } as ReturnType<typeof useConfiguracionEmpresa>);

    renderAppLayout();
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(document.querySelector('link[rel="icon"]')).not.toBeNull();
    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
  });
});
