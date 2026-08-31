import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CierreNoVentaForm } from "@/funcionalidades/oportunidades/detalle/CierreNoVentaForm";

describe("CierreNoVentaForm", () => {
  it("muestra un mensaje de error ante una observación demasiado corta", async () => {
    const onValidSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CierreNoVentaForm onValidSubmit={onValidSubmit} />);

    await user.type(screen.getByLabelText(/Observación del motivo/), "Muy corto.");
    await user.click(screen.getByRole("button", { name: "Cerrar como No Venta" }));

    expect(
      await screen.findByText("Mínimo 20 caracteres"),
    ).toHaveClass("text-destructive");
    expect(onValidSubmit).not.toHaveBeenCalled();
  });

  it("con una observación válida llama a onValidSubmit", async () => {
    const onValidSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CierreNoVentaForm onValidSubmit={onValidSubmit} />);

    const observacion = "El cliente ya no está interesado en el producto ofrecido.";
    await user.type(screen.getByLabelText(/Observación del motivo/), observacion);
    await user.click(screen.getByRole("button", { name: "Cerrar como No Venta" }));

    expect(onValidSubmit).toHaveBeenCalledWith({ observacionCierre: observacion });
  });
});
