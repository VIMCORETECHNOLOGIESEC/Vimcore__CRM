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

describe("EmpresaAparienciaForm — vista previa extendida (contraste + mockup)", () => {
  it("no muestra advertencia de contraste cuando los colores elegidos son legibles", () => {
    render(
      <EmpresaAparienciaForm
        mostrarNombre={false}
        valoresIniciales={{ colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null }}
        enviando={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(
      screen.queryByText("Este color tiene bajo contraste, el texto podría costar leerse."),
    ).not.toBeInTheDocument();
  });

  it("muestra una advertencia no bloqueante cuando el color primario elegido tiene bajo contraste", async () => {
    const user = userEvent.setup();
    render(
      <EmpresaAparienciaForm
        mostrarNombre={false}
        valoresIniciales={{ colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null }}
        enviando={false}
        onSubmit={vi.fn()}
      />,
    );

    const campoPrimario = screen.getByLabelText("Color primario");
    await user.clear(campoPrimario);
    await user.type(campoPrimario, "#888888");

    expect(
      await screen.findByText("Este color tiene bajo contraste, el texto podría costar leerse."),
    ).toBeInTheDocument();

    // Solo un color tiene bajo contraste -- una única advertencia, no dos.
    expect(
      screen.getAllByText("Este color tiene bajo contraste, el texto podría costar leerse."),
    ).toHaveLength(1);
  });

  it("no bloquea el envío del formulario cuando hay un color de bajo contraste", async () => {
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

    const campoPrimario = screen.getByLabelText("Color primario");
    await user.clear(campoPrimario);
    await user.type(campoPrimario, "#888888");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(onSubmit).toHaveBeenCalledWith({
      colorPrimario: "#888888",
      colorSecundario: "#222222",
      logoUrl: null,
    });
  });

  it("renderiza un mini panel lateral y un botón de acento de ejemplo con los colores en vivo", async () => {
    const user = userEvent.setup();
    render(
      <EmpresaAparienciaForm
        mostrarNombre={false}
        valoresIniciales={{ colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null }}
        enviando={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Panel lateral")).toBeInTheDocument();
    expect(screen.getByTestId("vista-previa-sidebar")).toHaveStyle({
      backgroundColor: "rgb(17, 17, 17)",
      color: "rgb(255, 255, 255)",
    });
    expect(screen.getByTestId("vista-previa-acento-boton")).toHaveStyle({
      backgroundColor: "rgb(34, 34, 34)",
      color: "rgb(255, 255, 255)",
    });

    const campoSecundario = screen.getByLabelText("Color secundario");
    await user.clear(campoSecundario);
    await user.type(campoSecundario, "#f97316");

    expect(screen.getByTestId("vista-previa-acento-boton")).toHaveStyle({
      backgroundColor: "rgb(249, 115, 22)",
    });
  });
});
