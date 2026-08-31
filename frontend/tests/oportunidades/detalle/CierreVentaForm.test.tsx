import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CierreVentaForm } from "@/funcionalidades/oportunidades/detalle/CierreVentaForm";

describe("CierreVentaForm", () => {
  it("muestra mensajes de error accionables ante datos inválidos", async () => {
    const onValidSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CierreVentaForm onValidSubmit={onValidSubmit} />);

    await user.click(screen.getByRole("button", { name: "Cerrar como Venta" }));

    const mensajes = await screen.findAllByText(
      (_, element) => element?.classList.contains("text-destructive") ?? false,
    );
    expect(mensajes.length).toBeGreaterThan(0);
    expect(onValidSubmit).not.toHaveBeenCalled();
  });

  it("con datos válidos llama a onValidSubmit con el monto y la forma de pago", async () => {
    const onValidSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CierreVentaForm onValidSubmit={onValidSubmit} />);

    await user.type(screen.getByLabelText("Monto (USD)"), "1500");
    await user.click(screen.getByRole("combobox", { name: "Forma de pago" }));
    await user.click(await screen.findByRole("option", { name: "Contado" }));
    await user.click(screen.getByRole("button", { name: "Cerrar como Venta" }));

    expect(onValidSubmit).toHaveBeenCalledWith({ montoVenta: 1500, formaPago: "CONTADO" });
  });
});
