import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bug real: `options.primaryColor` de Joyride estaba hardcodeado en
 * "#2563EB" -- Joyride deriva de este único valor el color del botón
 * "Siguiente" y sus estados hover/focus, así que el tutorial guiado nunca
 * reflejaba el color de marca real de cada empresa. Fix: `colorAcento` llega
 * como prop desde `AppLayout.tsx` (que ya resuelve el color de marca vía
 * `resolveMarcaCompleta`, `--marca-color-2`), en vez de que este componente
 * resuelva la marca de cero.
 */

type JoyrideOptionsSnapshot = { primaryColor?: string };

let latestOptions: JoyrideOptionsSnapshot | null = null;

vi.mock("react-joyride", async () => {
  const actual = await vi.importActual<typeof import("react-joyride")>("react-joyride");

  return {
    ...actual,
    Joyride: ({ options }: { options: JoyrideOptionsSnapshot }) => {
      latestOptions = options;
      return <div data-testid="joyride-mock" />;
    },
  };
});

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { LeadsNavigationTutorialProvider } = await import(
  "@/funcionalidades/leads/tutorial/LeadsNavigationTutorial"
);

const useAuthMock = vi.mocked(useAuth);

beforeEach(() => {
  latestOptions = null;
  useAuthMock.mockReturnValue({
    user: { id: "u1", nombre: "Usuaria", correo: "u1@crm.test", rol: "ADMINISTRADOR" },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: () => true,
  });
});

function renderProvider(colorAcento?: string) {
  return render(
    <MemoryRouter>
      <LeadsNavigationTutorialProvider colorAcento={colorAcento}>
        <div>contenido</div>
      </LeadsNavigationTutorialProvider>
    </MemoryRouter>,
  );
}

describe("LeadsNavigationTutorial -- color de marca en el botón 'Siguiente' de Joyride", () => {
  it("usa el color de marca recibido por prop, no un azul fijo", () => {
    renderProvider("#f97316");

    expect(latestOptions?.primaryColor).toBe("#f97316");
  });

  it("cae al color por defecto del CRM (#2563eb) cuando no se recibe colorAcento (ej. empresa sin marca propia)", () => {
    renderProvider(undefined);

    expect(latestOptions?.primaryColor).toBe("#2563eb");
  });
});
