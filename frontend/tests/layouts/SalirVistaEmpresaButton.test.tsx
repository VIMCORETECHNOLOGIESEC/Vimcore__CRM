import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useSearchParams } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/funcionalidades/autenticacion/authContext", () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/authContext");
const { SalirVistaEmpresaButton } = await import("@/layouts/SalirVistaEmpresaButton");

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
