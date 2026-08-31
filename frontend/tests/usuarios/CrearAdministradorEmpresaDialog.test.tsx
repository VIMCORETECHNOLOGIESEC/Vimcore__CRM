import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CrearAdministradorEmpresaDialog } from "@/funcionalidades/usuarios/CrearAdministradorEmpresaDialog";

function renderDialog(onSubmit = vi.fn(), enviando = false) {
  const onOpenChange = vi.fn();
  render(
    <CrearAdministradorEmpresaDialog
      open
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      enviando={enviando}
    />,
  );
  return { onSubmit, onOpenChange };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CrearAdministradorEmpresaDialog (Item 23)", () => {
  it("no tiene un campo `rol` -- el rol es implícito ADMINISTRADOR", () => {
    renderDialog();

    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña inicial")).toBeInTheDocument();
    expect(screen.queryByLabelText("Rol")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("rechaza una contraseña de menos de 12 caracteres sin llamar a onSubmit", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await user.type(screen.getByLabelText("Nombre"), "Ana Gómez");
    await user.type(screen.getByLabelText("Correo"), "ana@crm.test");
    await user.type(screen.getByLabelText("Contraseña inicial"), "corta123");
    await user.click(screen.getByRole("button", { name: "Crear administrador" }));

    expect(
      await screen.findByText("La contraseña debe tener al menos 12 caracteres."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("con datos válidos, llama a onSubmit con `{ nombre, correo, password }` (sin `rol`)", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await user.type(screen.getByLabelText("Nombre"), "Ana Gómez");
    await user.type(screen.getByLabelText("Correo"), "ana@crm.test");
    await user.type(screen.getByLabelText("Contraseña inicial"), "una-contraseña-larga-1");
    await user.click(screen.getByRole("button", { name: "Crear administrador" }));

    expect(onSubmit).toHaveBeenCalledWith({
      nombre: "Ana Gómez",
      correo: "ana@crm.test",
      password: "una-contraseña-larga-1",
    });
  });

  it("«Cancelar» llama a onOpenChange(false)", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("mientras `enviando` es true, los campos y botones están deshabilitados", () => {
    renderDialog(vi.fn(), true);

    expect(screen.getByLabelText("Nombre")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Creando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  });
});
