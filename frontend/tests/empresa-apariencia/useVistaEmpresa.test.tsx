import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useSearchParams } from "react-router";
import { describe, expect, it } from "vitest";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";

/**
 * `useVistaEmpresa`: hook sobre `useSearchParams` que centraliza la "vista
 * de empresa" simulada de un holding-wide (`?empresaId=` en la URL). Mismo
 * criterio de test que `SalirVistaEmpresaButton.test.tsx` (consumidor real
 * de este hook): se prueba el comportamiento observable vía la URL, sin
 * mockear `useSearchParams`.
 */

function Sonda() {
  const { empresaVistaId, entrarAEmpresa, salirDeEmpresa } = useVistaEmpresa();
  const [searchParams] = useSearchParams();
  return (
    <div>
      <span data-testid="empresa-vista-id">{empresaVistaId ?? "null"}</span>
      <span data-testid="query-actual">{searchParams.toString()}</span>
      <button onClick={() => entrarAEmpresa("e1")}>entrar-e1</button>
      <button onClick={() => entrarAEmpresa("e2")}>entrar-e2</button>
      <button onClick={() => salirDeEmpresa()}>salir</button>
    </div>
  );
}

function renderConRuta(searchParamsIniciales: string) {
  return render(
    <MemoryRouter initialEntries={[`/usuarios${searchParamsIniciales}`]}>
      <Routes>
        <Route path="/usuarios" element={<Sonda />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useVistaEmpresa — flujo principal", () => {
  it("empresaVistaId es null sin ?empresaId en la URL", () => {
    renderConRuta("");
    expect(screen.getByTestId("empresa-vista-id")).toHaveTextContent("null");
  });

  it("empresaVistaId lee el valor ya presente en la URL", () => {
    renderConRuta("?empresaId=e1");
    expect(screen.getByTestId("empresa-vista-id")).toHaveTextContent("e1");
  });

  it("entrarAEmpresa setea empresaId en la URL", async () => {
    renderConRuta("");
    await userEvent.click(screen.getByRole("button", { name: "entrar-e1" }));
    expect(screen.getByTestId("empresa-vista-id")).toHaveTextContent("e1");
  });

  it("salirDeEmpresa limpia empresaId de la URL", async () => {
    renderConRuta("?empresaId=e1");
    await userEvent.click(screen.getByRole("button", { name: "salir" }));
    expect(screen.getByTestId("empresa-vista-id")).toHaveTextContent("null");
  });

  it("entrarAEmpresa con una empresa distinta reemplaza el valor anterior", async () => {
    renderConRuta("?empresaId=e1");
    await userEvent.click(screen.getByRole("button", { name: "entrar-e2" }));
    expect(screen.getByTestId("empresa-vista-id")).toHaveTextContent("e2");
    expect(screen.getByTestId("query-actual").textContent).toBe("empresaId=e2");
  });
});

describe("useVistaEmpresa — punto frágil: nunca debe tocar otros query params", () => {
  it("entrarAEmpresa agrega empresaId sin pisar un query param ya presente", async () => {
    renderConRuta("?busqueda=ana");
    await userEvent.click(screen.getByRole("button", { name: "entrar-e1" }));

    expect(screen.getByTestId("query-actual").textContent).toBe("busqueda=ana&empresaId=e1");
  });

  it("entrarAEmpresa preserva múltiples query params ya presentes", async () => {
    renderConRuta("?busqueda=ana&page=2");
    await userEvent.click(screen.getByRole("button", { name: "entrar-e1" }));

    const query = new URLSearchParams(screen.getByTestId("query-actual").textContent ?? "");
    expect(query.get("busqueda")).toBe("ana");
    expect(query.get("page")).toBe("2");
    expect(query.get("empresaId")).toBe("e1");
  });

  it("salirDeEmpresa quita solo empresaId, sin tocar otros query params", async () => {
    renderConRuta("?empresaId=e1&busqueda=ana&page=3");
    await userEvent.click(screen.getByRole("button", { name: "salir" }));

    const query = new URLSearchParams(screen.getByTestId("query-actual").textContent ?? "");
    expect(query.has("empresaId")).toBe(false);
    expect(query.get("busqueda")).toBe("ana");
    expect(query.get("page")).toBe("3");
  });

  it("reemplazar empresaId (cambiar de empresa) no descarta otros query params", async () => {
    renderConRuta("?empresaId=e1&busqueda=ana");
    await userEvent.click(screen.getByRole("button", { name: "entrar-e2" }));

    const query = new URLSearchParams(screen.getByTestId("query-actual").textContent ?? "");
    expect(query.get("empresaId")).toBe("e2");
    expect(query.get("busqueda")).toBe("ana");
  });
});
