import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CrearEmpresaHoldingDialog } from "@/funcionalidades/empresa-apariencia/CrearEmpresaHoldingDialog";

describe("CrearEmpresaHoldingDialog", () => {
  it("arranca con el formulario vacío", () => {
    render(
      <CrearEmpresaHoldingDialog open onOpenChange={vi.fn()} enviando={false} onSubmit={vi.fn()} />,
    );

    expect(screen.getByLabelText("Nombre de la empresa")).toHaveValue("");
    expect(screen.getByLabelText("Color primario")).toHaveValue("");
    expect(screen.getByLabelText("Color secundario")).toHaveValue("");
  });

  it("envía nombre y colores completados", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <CrearEmpresaHoldingDialog open onOpenChange={vi.fn()} enviando={false} onSubmit={onSubmit} />,
    );

    await user.type(screen.getByLabelText("Nombre de la empresa"), "Empresa Nueva");
    await user.click(screen.getByRole("button", { name: "Crear empresa" }));

    expect(onSubmit).toHaveBeenCalledWith({
      nombre: "Empresa Nueva",
      colorPrimario: null,
      colorSecundario: null,
      logoUrl: null,
    });
  });

  it("no se renderiza cuando open es false", () => {
    render(
      <CrearEmpresaHoldingDialog
        open={false}
        onOpenChange={vi.fn()}
        enviando={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Nombre de la empresa")).not.toBeInTheDocument();
  });
});
