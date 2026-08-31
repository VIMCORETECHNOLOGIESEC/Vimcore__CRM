import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmpresaAparienciaForm } from "@/funcionalidades/empresa-apariencia/EmpresaAparienciaForm";

describe("EmpresaAparienciaForm — self-service (sin nombre)", () => {
  it("no muestra el campo de nombre", () => {
    render(
      <EmpresaAparienciaForm
        mostrarNombre={false}
        valoresIniciales={{ colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null }}
        enviando={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Nombre de la empresa")).not.toBeInTheDocument();
  });

  it("precarga los colores vigentes y convierte '' a null al enviar un color vaciado", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <EmpresaAparienciaForm
        mostrarNombre={false}
        valoresIniciales={{ colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null }}
        enviando={false}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText("Color primario")).toHaveValue("#111111");

    await user.clear(screen.getByLabelText("Color primario"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(onSubmit).toHaveBeenCalledWith({
      colorPrimario: null,
      colorSecundario: "#222222",
      logoUrl: null,
    });
  });

  it("valida el formato hexadecimal antes de enviar y no llama a onSubmit", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <EmpresaAparienciaForm
        mostrarNombre={false}
        valoresIniciales={{ colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null }}
        enviando={false}
        onSubmit={onSubmit}
      />,
    );

    const campoColor = screen.getByLabelText("Color primario");
    await user.clear(campoColor);
    await user.type(campoColor, "no-es-un-color");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(
      await screen.findByText("Ingresá un color hexadecimal válido (ej. #1e2a5e)."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("EmpresaAparienciaForm — admin holding (con nombre)", () => {
  it("muestra el campo de nombre precargado y lo incluye en el envío", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <EmpresaAparienciaForm
        mostrarNombre
        valoresIniciales={{
          nombre: "Empresa A",
          colorPrimario: "#111111",
          colorSecundario: "#222222",
          logoUrl: null,
        }}
        enviando={false}
        onSubmit={onSubmit}
      />,
    );

    const campoNombre = screen.getByLabelText("Nombre de la empresa");
    expect(campoNombre).toHaveValue("Empresa A");

    await user.clear(campoNombre);
    await user.type(campoNombre, "Empresa A Renombrada");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(onSubmit).toHaveBeenCalledWith({
      nombre: "Empresa A Renombrada",
      colorPrimario: "#111111",
      colorSecundario: "#222222",
      logoUrl: null,
    });
  });

  it("rechaza un nombre vacío antes de enviar", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <EmpresaAparienciaForm
        mostrarNombre
        valoresIniciales={{
          nombre: "Empresa A",
          colorPrimario: "#111111",
          colorSecundario: "#222222",
          logoUrl: null,
        }}
        enviando={false}
        onSubmit={onSubmit}
      />,
    );

    await user.clear(screen.getByLabelText("Nombre de la empresa"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Ingresá el nombre de la empresa.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
