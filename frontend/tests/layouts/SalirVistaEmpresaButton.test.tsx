import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useSearchParams } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));
// "Salir" ahora resuelve la marca del HOLDING para la cortina de salida --
// mismo criterio de mock que `AppLayout.test.tsx` para no depender de un
// fetch real.
vi.mock("@/funcionalidades/configuracion-empresa/useConfiguracionEmpresa", () => ({
  useConfiguracionEmpresa: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router")>();
  return { ...original, useNavigate: () => navigateMock };
});

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { useConfiguracionEmpresa } = await import(
  "@/funcionalidades/configuracion-empresa/useConfiguracionEmpresa"
);
const { SalirVistaEmpresaButton } = await import("@/layouts/SalirVistaEmpresaButton");

const useConfiguracionEmpresaMock = vi.mocked(useConfiguracionEmpresa);

beforeEach(() => {
  navigateMock.mockReset();
  useConfiguracionEmpresaMock.mockReturnValue({
    data: { nombre: "Holding X", colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null },
    isLoading: false,
  } as ReturnType<typeof useConfiguracionEmpresa>);
});

/**
 * `SalirVistaEmpresaButton`: consume `useVistaEmpresa()` (fuente de verdad
 * compartida, `funcionalidades/empresa-apariencia/useVistaEmpresa.ts`), que
 * a su vez está implementado sobre `useSearchParams` -- estos tests siguen
 * verificando el comportamiento observable real vía la URL (`?empresaId=`),
 * sin mockear el hook, para probar la integración completa igual que antes
 * del swap.
 */

function renderConRuta(searchParamsIniciales: string, sessionScope: "holding" | "company" = "holding") {
  vi.mocked(useAuth).mockReturnValue({
    user: { sessionScope, rol: "ADMINISTRADOR" },
  } as never);

  function SondaSearchParams() {
    const [searchParams] = useSearchParams();
    return <span data-testid="query-actual">{searchParams.toString()}</span>;
  }

  return render(
    <MemoryRouter initialEntries={[`/usuarios${searchParamsIniciales}`]}>
      <Routes>
        <Route
          path="/usuarios"
          element={
            <>
              <SalirVistaEmpresaButton />
              <SondaSearchParams />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SalirVistaEmpresaButton", () => {
  it("no renderiza nada sin ?empresaId en la URL", () => {
    renderConRuta("");
    expect(screen.queryByRole("button", { name: /salir de vista de empresa/i })).not.toBeInTheDocument();
  });

  it("no renderiza nada para una sesión company (el filtro de empresa es exclusivo de holding-wide)", () => {
    renderConRuta("?empresaId=empresa-a", "company");
    expect(screen.queryByRole("button", { name: /salir de vista de empresa/i })).not.toBeInTheDocument();
  });

  it("renderiza el botón cuando la URL trae ?empresaId= y la sesión es holding", () => {
    renderConRuta("?empresaId=empresa-a");
    expect(screen.getByRole("button", { name: /salir de vista de empresa/i })).toBeInTheDocument();
  });

  it("al hacer click, quita empresaId de la URL sin tocar otros query params", async () => {
    renderConRuta("?empresaId=empresa-a&busqueda=ana");
    await userEvent.click(screen.getByRole("button", { name: /salir de vista de empresa/i }));

    expect(screen.getByTestId("query-actual").textContent).toBe("busqueda=ana");
    expect(screen.queryByRole("button", { name: /salir de vista de empresa/i })).not.toBeInTheDocument();
  });
});

describe("SalirVistaEmpresaButton — cortina de salida (transición hacia /empresas/:empresaId)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("al hacer clic, muestra la cortina con la marca del HOLDING (no la de la empresa que se dejaba de mirar)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderConRuta("?empresaId=empresa-a");

    await user.click(screen.getByRole("button", { name: /salir de vista de empresa/i }));

    const splash = screen.getByRole("status");
    expect(splash).toHaveTextContent("Holding X");
    expect(splash.style.getPropertyValue("--marca-color-1")).toBe("#111111");
    expect(splash.style.getPropertyValue("--marca-color-2")).toBe("#222222");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("quita ?empresaId= de la URL de inmediato al hacer clic, ANTES de navegar (captura previa a salirDeEmpresa)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderConRuta("?empresaId=empresa-a&busqueda=ana");

    await user.click(screen.getByRole("button", { name: /salir de vista de empresa/i }));

    expect(screen.getByTestId("query-actual").textContent).toBe("busqueda=ana");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("navega a /empresas/:empresaId (el capturado ANTES de limpiar la URL) recién después de ~1500ms", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderConRuta("?empresaId=empresa-a");

    await user.click(screen.getByRole("button", { name: /salir de vista de empresa/i }));
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(navigateMock).toHaveBeenCalledWith("/empresas/empresa-a");
  });
});
