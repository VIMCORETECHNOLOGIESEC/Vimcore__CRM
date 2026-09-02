import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TutorialEntryDialog } from "@/funcionalidades/leads/tutorial/TutorialEntryDialog";

describe("TutorialEntryDialog", () => {
  it("renderiza el copy exacto del modal de entrada", () => {
    render(<TutorialEntryDialog open onIniciar={vi.fn()} onCerrar={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "¿Quieres un recorrido rápido por Leads?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Te mostramos cómo revisar un lead, avanzarlo de etapa y cerrar una venta, con un lead de ejemplo — no vas a tocar datos reales.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("No volver a mostrar este aviso")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar recorrido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ahora no" })).toBeInTheDocument();
  });

  it("no renderiza nada cuando open es false", () => {
    render(<TutorialEntryDialog open={false} onIniciar={vi.fn()} onCerrar={vi.fn()} />);

    expect(
      screen.queryByRole("heading", { name: "¿Quieres un recorrido rápido por Leads?" }),
    ).not.toBeInTheDocument();
  });

  it("'Iniciar recorrido' llama onIniciar y onCerrar(false) cuando el checkbox no está tildado", async () => {
    const onIniciar = vi.fn();
    const onCerrar = vi.fn();
    const user = userEvent.setup();
    render(<TutorialEntryDialog open onIniciar={onIniciar} onCerrar={onCerrar} />);

    await user.click(screen.getByRole("button", { name: "Iniciar recorrido" }));

    expect(onIniciar).toHaveBeenCalledTimes(1);
    expect(onCerrar).toHaveBeenCalledWith(false);
  });

  it("'Iniciar recorrido' llama onCerrar(true) cuando el checkbox SÍ está tildado", async () => {
    const onIniciar = vi.fn();
    const onCerrar = vi.fn();
    const user = userEvent.setup();
    render(<TutorialEntryDialog open onIniciar={onIniciar} onCerrar={onCerrar} />);

    await user.click(screen.getByLabelText("No volver a mostrar este aviso"));
    await user.click(screen.getByRole("button", { name: "Iniciar recorrido" }));

    expect(onIniciar).toHaveBeenCalledTimes(1);
    expect(onCerrar).toHaveBeenCalledWith(true);
  });

  it("'Ahora no' llama onCerrar con el estado del checkbox, sin llamar onIniciar", async () => {
    const onIniciar = vi.fn();
    const onCerrar = vi.fn();
    const user = userEvent.setup();
    render(<TutorialEntryDialog open onIniciar={onIniciar} onCerrar={onCerrar} />);

    await user.click(screen.getByLabelText("No volver a mostrar este aviso"));
    await user.click(screen.getByRole("button", { name: "Ahora no" }));

    expect(onIniciar).not.toHaveBeenCalled();
    expect(onCerrar).toHaveBeenCalledWith(true);
  });

  it("Escape nunca marca 'no volver a mostrar', incluso con el checkbox tildado", async () => {
    const onCerrar = vi.fn();
    const user = userEvent.setup();
    render(<TutorialEntryDialog open onIniciar={vi.fn()} onCerrar={onCerrar} />);

    await user.click(screen.getByLabelText("No volver a mostrar este aviso"));
    await user.keyboard("{Escape}");

    expect(onCerrar).toHaveBeenCalledWith(false);
  });
});
