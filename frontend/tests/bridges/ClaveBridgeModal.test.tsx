import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaveBridgeModal } from "@/funcionalidades/bridges/ClaveBridgeModal";

/**
 * Modal de clave de un solo uso (bridge-lifecycle-management, Requirement:
 * Reinforced Key Confirmation). `jsdom` no implementa `navigator.clipboard`
 * de forma nativa, pero `userEvent.setup()` (v14) instala su PROPIO stub de
 * `navigator.clipboard.writeText` internamente -- mockearlo ANTES de
 * `setup()` no sirve, `userEvent` lo pisa. Por eso el espía se arma DESPUÉS
 * de `userEvent.setup()`, con `vi.spyOn` sobre el método que `userEvent` ya
 * instaló, en vez de reemplazar el objeto completo en un `beforeEach` global.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

function renderModal(onClose = vi.fn()) {
  render(
    <ClaveBridgeModal open bridgeNombre="Google Forms — Pruebas" claveApi="brg_abc123def456" onClose={onClose} />,
  );
  return { onClose };
}

describe("ClaveBridgeModal — bloquea el cierre prematuro", () => {
  it("muestra la clave en texto plano", () => {
    renderModal();
    expect(screen.getByText("brg_abc123def456")).toBeInTheDocument();
  });

  it("el botón «Entendido, cerrar» está deshabilitado hasta confirmar la casilla", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Entendido, cerrar" })).toBeDisabled();
  });

  it("tildar la casilla habilita el botón «Entendido, cerrar» y al hacer clic llama a onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(
      screen.getByRole("checkbox", { name: "Ya copié la clave y la guardé en un lugar seguro" }),
    );
    expect(screen.getByRole("button", { name: "Entendido, cerrar" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Entendido, cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("presionar Escape antes de confirmar NO cierra el modal", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("brg_abc123def456")).toBeInTheDocument();
  });

  it("hacer clic en el botón de copiar copia la clave al portapapeles", async () => {
    const user = userEvent.setup();
    const escribirEnPortapapeles = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    renderModal();

    await user.click(screen.getByRole("button", { name: /copiar/i }));

    expect(escribirEnPortapapeles).toHaveBeenCalledWith("brg_abc123def456");
  });
});
