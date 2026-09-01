import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CargarLeadManualDialog } from "@/funcionalidades/leads/CargarLeadManualDialog";
import type { CanalManual } from "@/funcionalidades/leads/canal-manual.api";

function canalFake(overrides: Partial<CanalManual> = {}): CanalManual {
  return {
    id: "canal-1",
    empresaId: "empresa-1",
    nombre: "Referido",
    activo: true,
    creadoEn: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderDialog(
  canales: CanalManual[] = [canalFake()],
  onSubmit = vi.fn(),
  enviando = false,
  opciones: { esAdministrador?: boolean; onRedirigirAGestionCanales?: () => void } = {},
) {
  const onOpenChange = vi.fn();
  const onRedirigirAGestionCanales = opciones.onRedirigirAGestionCanales ?? vi.fn();
  render(
    <CargarLeadManualDialog
      open
      onOpenChange={onOpenChange}
      canales={canales}
      onSubmit={onSubmit}
      enviando={enviando}
      esAdministrador={opciones.esAdministrador ?? false}
      onRedirigirAGestionCanales={onRedirigirAGestionCanales}
    />,
  );
  return { onSubmit, onOpenChange, onRedirigirAGestionCanales };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CargarLeadManualDialog", () => {
  it("muestra los campos nombre, teléfono, correo y canal", () => {
    renderDialog();

    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Teléfono")).toBeInTheDocument();
    expect(screen.getByLabelText("Correo (opcional)")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Canal" })).toBeInTheDocument();
  });

  it("solo ofrece canales activos en el selector", async () => {
    const user = userEvent.setup();
    renderDialog([canalFake({ nombre: "Referido" }), canalFake({ id: "canal-2", nombre: "Descontinuado", activo: false })]);

    await user.click(screen.getByRole("combobox", { name: "Canal" }));

    expect(await screen.findByRole("option", { name: "Referido" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Descontinuado" })).not.toBeInTheDocument();
  });

  it("rechaza el envío sin nombre, sin teléfono ni canal, sin llamar a onSubmit", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cargar lead" }));

    // Backend real (`leads.schema.ts::crearLeadManualBodySchema`): `nombre`
    // es obligatorio, no confundir con `Cliente.nombre` (opcional en el
    // modelo).
    expect(await screen.findByText("Ingresa el nombre.")).toBeInTheDocument();
    expect(screen.getByText("Ingresa el teléfono.")).toBeInTheDocument();
    // `defaultValues: { canalManualId: "" }` en el `useForm` asegura que el
    // `<Select>` sin elegir falle por `.min(1, ...)` (mensaje en español),
    // nunca por el chequeo de tipo de Zod con `undefined` (mensaje en inglés
    // por defecto -- violaría AGENTS.md §2/§4).
    expect(screen.getByText("Elige un canal.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rechaza un correo con formato inválido", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await user.type(screen.getByLabelText("Nombre"), "María Cabrera");
    await user.type(screen.getByLabelText("Teléfono"), "0991234567");
    await user.type(screen.getByLabelText("Correo (opcional)"), "no-es-un-correo");
    await user.click(screen.getByRole("combobox", { name: "Canal" }));
    await user.click(await screen.findByRole("option", { name: "Referido" }));
    await user.click(screen.getByRole("button", { name: "Cargar lead" }));

    expect(await screen.findByText("Ingresa un correo electrónico válido.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("con datos válidos, llama a onSubmit con los valores correctos (sin empresaId)", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog([canalFake({ id: "canal-9", nombre: "Feria/evento" })]);

    await user.type(screen.getByLabelText("Nombre"), "María Cabrera");
    await user.type(screen.getByLabelText("Teléfono"), "0991234567");
    await user.type(screen.getByLabelText("Correo (opcional)"), "maria@correo.test");
    await user.click(screen.getByRole("combobox", { name: "Canal" }));
    await user.click(await screen.findByRole("option", { name: "Feria/evento" }));
    await user.click(screen.getByRole("button", { name: "Cargar lead" }));

    expect(onSubmit).toHaveBeenCalledWith({
      nombre: "María Cabrera",
      telefono: "0991234567",
      correo: "maria@correo.test",
      canalManualId: "canal-9",
    });
  });

  it("con correo vacío, envía undefined (no cadena vacía) sin afectar el nombre obligatorio", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog([canalFake({ id: "canal-9" })]);

    await user.type(screen.getByLabelText("Nombre"), "María Cabrera");
    await user.type(screen.getByLabelText("Teléfono"), "0991234567");
    await user.click(screen.getByRole("combobox", { name: "Canal" }));
    await user.click(await screen.findByRole("option", { name: "Referido" }));
    await user.click(screen.getByRole("button", { name: "Cargar lead" }));

    expect(onSubmit).toHaveBeenCalledWith({
      nombre: "María Cabrera",
      telefono: "0991234567",
      correo: undefined,
      canalManualId: "canal-9",
    });
  });

  it("«Cancelar» llama a onOpenChange(false)", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("mientras `enviando` es true, los campos y botones están deshabilitados", () => {
    renderDialog([canalFake()], vi.fn(), true);

    expect(screen.getByLabelText("Nombre")).toBeDisabled();
    expect(screen.getByLabelText("Teléfono")).toBeDisabled();
    expect(screen.getByLabelText("Correo (opcional)")).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Canal" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cargando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  });
});

/**
 * Sin canales activos: Administrador se redirige a "Gestionar canales" en
 * vez de ver el formulario vacío/error de validación (tarea C1). Roles no
 * Administrador conservan el comportamiento previo -- ver el prompt de esta
 * tarea, la variante "Supervisor/Asesor → notificar admin" queda fuera de
 * alcance (bloqueada en `POST /notificaciones`, todavía inexistente).
 */
describe("CargarLeadManualDialog — sin canales activos", () => {
  it("Administrador ve un estado vacío con acción para ir a gestionar canales, sin el formulario", () => {
    renderDialog([], vi.fn(), false, { esAdministrador: true });

    expect(screen.getByText("Todavía no hay canales de ingreso manual")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ir a gestionar canales" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Nombre")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cargar lead" })).not.toBeInTheDocument();
  });

  it("Administrador: al hacer clic en la acción, llama a onRedirigirAGestionCanales", async () => {
    const user = userEvent.setup();
    const { onRedirigirAGestionCanales } = renderDialog([], vi.fn(), false, {
      esAdministrador: true,
    });

    await user.click(screen.getByRole("button", { name: "Ir a gestionar canales" }));

    expect(onRedirigirAGestionCanales).toHaveBeenCalledTimes(1);
  });

  it("no Administrador (ej. Asesor) sigue viendo el formulario vacío con validación normal", () => {
    renderDialog([], vi.fn(), false, { esAdministrador: false });

    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Canal" })).toBeInTheDocument();
    expect(screen.queryByText("Todavía no hay canales de ingreso manual")).not.toBeInTheDocument();
  });
});
