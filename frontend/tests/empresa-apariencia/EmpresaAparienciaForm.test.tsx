import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/httpClient";
import { EmpresaAparienciaForm } from "@/funcionalidades/empresa-apariencia/EmpresaAparienciaForm";

function archivoFake(nombre: string, tipo: string, bytes = 10) {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

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
      await screen.findByText("Ingresa un color hexadecimal válido (ej. #1e2a5e)."),
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

    expect(await screen.findByText("Ingresa el nombre de la empresa.")).toBeInTheDocument();
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

describe("EmpresaAparienciaForm — subida del isotipo", () => {
  it("deshabilita el selector de archivo y avisa que la subida no está disponible cuando no hay onSubirLogo", () => {
    render(
      <EmpresaAparienciaForm
        mostrarNombre={false}
        valoresIniciales={{ colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null }}
        enviando={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Isotipo (opcional)")).toBeDisabled();
    expect(screen.getByText("Subida de archivo próximamente para este caso.")).toBeInTheDocument();
  });

  it("rechaza un archivo de tipo no soportado sin llamar a onSubirLogo", async () => {
    const onSubirLogo = vi.fn();
    // `applyAccept: false` -- el atributo `accept` del input ya filtra la
    // elección en un navegador real, pero acá se fuerza igual la selección
    // para probar la validación propia (defensa en profundidad, ej. un
    // navegador que no respete `accept`).
    const user = userEvent.setup({ applyAccept: false });
    render(
      <EmpresaAparienciaForm
        mostrarNombre={false}
        valoresIniciales={{ colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null }}
        enviando={false}
        onSubmit={vi.fn()}
        onSubirLogo={onSubirLogo}
      />,
    );

    const campoArchivo = screen.getByLabelText("Isotipo (opcional)");
    await user.upload(campoArchivo, archivoFake("logo.txt", "text/plain"));

    expect(
      await screen.findByText("El archivo debe ser una imagen PNG, JPG, WEBP o SVG"),
    ).toBeInTheDocument();
    expect(onSubirLogo).not.toHaveBeenCalled();
  });

  it("rechaza un archivo que supera los 2 MB sin llamar a onSubirLogo", async () => {
    const onSubirLogo = vi.fn();
    const user = userEvent.setup();
    render(
      <EmpresaAparienciaForm
        mostrarNombre={false}
        valoresIniciales={{ colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null }}
        enviando={false}
        onSubmit={vi.fn()}
        onSubirLogo={onSubirLogo}
      />,
    );

    const campoArchivo = screen.getByLabelText("Isotipo (opcional)");
    await user.upload(campoArchivo, archivoFake("logo.png", "image/png", 2 * 1024 * 1024 + 1));

    expect(
      await screen.findByText("El archivo supera el tamaño máximo permitido (2 MB)"),
    ).toBeInTheDocument();
    expect(onSubirLogo).not.toHaveBeenCalled();
  });

  it("sube un archivo válido, muestra la vista previa y envía la URL nueva al guardar", async () => {
    const onSubmit = vi.fn();
    const onSubirLogo = vi.fn().mockResolvedValue("https://cdn.miempresa.com/nuevo-logo.png");
    const user = userEvent.setup();
    render(
      <EmpresaAparienciaForm
        mostrarNombre={false}
        valoresIniciales={{ colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null }}
        enviando={false}
        onSubmit={onSubmit}
        onSubirLogo={onSubirLogo}
      />,
    );

    const campoArchivo = screen.getByLabelText("Isotipo (opcional)");
    await user.upload(campoArchivo, archivoFake("logo.png", "image/png"));

    await waitFor(() => expect(onSubirLogo).toHaveBeenCalledTimes(1));
    expect(await screen.findByAltText("Vista previa del isotipo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(onSubmit).toHaveBeenCalledWith({
      colorPrimario: "#111111",
      colorSecundario: "#222222",
      logoUrl: "https://cdn.miempresa.com/nuevo-logo.png",
    });
  });

  it("muestra el mensaje accionable del backend si la subida falla", async () => {
    const onSubirLogo = vi
      .fn()
      .mockRejectedValue(new ApiError("archivo_invalido", 400, "El archivo supera el tamaño máximo permitido (2 MB)"));
    const user = userEvent.setup();
    render(
      <EmpresaAparienciaForm
        mostrarNombre={false}
        valoresIniciales={{ colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null }}
        enviando={false}
        onSubmit={vi.fn()}
        onSubirLogo={onSubirLogo}
      />,
    );

    const campoArchivo = screen.getByLabelText("Isotipo (opcional)");
    await user.upload(campoArchivo, archivoFake("logo.png", "image/png"));

    expect(
      await screen.findByText("El archivo supera el tamaño máximo permitido (2 MB)"),
    ).toBeInTheDocument();
  });
});
