import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditarEmpresaHoldingDialog } from "@/funcionalidades/empresa-apariencia/EditarEmpresaHoldingDialog";
import type { EmpresaAparienciaHoldingView } from "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api";

function empresaFake(overrides: Partial<EmpresaAparienciaHoldingView> = {}): EmpresaAparienciaHoldingView {
  return {
    id: "e2",
    nombre: "Empresa B",
    colorPrimario: "#065f46",
    colorSecundario: "#10b981",
    logoUrl: null,
    ...overrides,
  };
}

describe("EditarEmpresaHoldingDialog", () => {
  it("precarga nombre y colores de la empresa recibida", () => {
    render(
      <EditarEmpresaHoldingDialog
        open
        onOpenChange={vi.fn()}
        empresa={empresaFake()}
        enviando={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Nombre de la empresa")).toHaveValue("Empresa B");
    expect(screen.getByLabelText("Color primario")).toHaveValue("#065f46");
    expect(screen.getByLabelText("Color secundario")).toHaveValue("#10b981");
  });

  it("envía nombre y colores editados, incluido cuando se renombra la empresa", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <EditarEmpresaHoldingDialog
        open
        onOpenChange={vi.fn()}
        empresa={empresaFake()}
        enviando={false}
        onSubmit={onSubmit}
      />,
    );

    const campoNombre = screen.getByLabelText("Nombre de la empresa");
    await user.clear(campoNombre);
    await user.type(campoNombre, "Empresa B (renombrada)");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(onSubmit).toHaveBeenCalledWith({
      nombre: "Empresa B (renombrada)",
      colorPrimario: "#065f46",
      colorSecundario: "#10b981",
      logoUrl: null,
    });
  });

  it("no se renderiza cuando open es false", () => {
    render(
      <EditarEmpresaHoldingDialog
        open={false}
        onOpenChange={vi.fn()}
        empresa={empresaFake()}
        enviando={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Nombre de la empresa")).not.toBeInTheDocument();
  });
});
