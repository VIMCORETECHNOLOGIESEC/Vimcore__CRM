import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WhatsAppConexionOverlay,
  type WhatsAppConexionOverlayStatus,
} from "@/funcionalidades/whatsapp/WhatsAppConexionOverlay";

/**
 * `WhatsAppConexionOverlay` -- máquina de estados del popup de conexión
 * (`ConectarWhatsAppCard.tsx`). El overlay se porta a `document.body` vía
 * `createPortal`, por eso cada test crea a mano un `<div id="root">` (el
 * mismo id real de `index.html`) para poder verificar que el `inert` se
 * aplica ahí y NO sobre el propio overlay.
 */
let appRoot: HTMLDivElement;

beforeEach(() => {
  appRoot = document.createElement("div");
  appRoot.id = "root";
  document.body.appendChild(appRoot);
});

afterEach(() => {
  appRoot.remove();
});

function renderOverlay(status: WhatsAppConexionOverlayStatus) {
  const onCancel = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <WhatsAppConexionOverlay status={status} onCancel={onCancel} onClose={onClose} />,
  );
  return { ...utils, onCancel, onClose };
}

describe("WhatsAppConexionOverlay — idle", () => {
  it("no renderiza nada ni aplica inert", () => {
    renderOverlay("idle");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(appRoot.hasAttribute("inert")).toBe(false);
  });
});

describe("WhatsAppConexionOverlay — waiting", () => {
  it("muestra el mensaje de espera y el botón Cancelar, aplica inert a #root", () => {
    renderOverlay("waiting");

    expect(
      screen.getByText("Esperando a que completes la conexión en la otra ventana…"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();

    const dialogo = screen.getByRole("alertdialog");
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(appRoot.hasAttribute("inert")).toBe(true);
  });

  it("el botón Cancelar llama a onCancel", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderOverlay("waiting");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("no se puede cerrar con Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderOverlay("waiting");

    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
  });

  it("no se puede cerrar clickeando el backdrop", async () => {
    const user = userEvent.setup();
    const { onClose } = renderOverlay("waiting");

    const dialogo = screen.getByRole("alertdialog");
    const backdrop = dialogo.parentElement as HTMLElement;
    await user.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("WhatsAppConexionOverlay — verifying", () => {
  it("muestra el mensaje de verificación, sin botones, sigue bloqueado e inert", () => {
    renderOverlay("verifying");

    expect(screen.getByText("Comprobando el estado real de la conexión…")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(appRoot.hasAttribute("inert")).toBe(true);
  });

  it("no se puede cerrar con Escape mientras verifica", async () => {
    const user = userEvent.setup();
    const { onClose } = renderOverlay("verifying");

    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("WhatsAppConexionOverlay — connected", () => {
  it("muestra el mensaje de éxito y permite cerrar", async () => {
    const user = userEvent.setup();
    const { onClose } = renderOverlay("connected");

    expect(screen.getByText("La conexión se completó correctamente.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Entendido" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("se puede cerrar con Escape en un estado final", async () => {
    const user = userEvent.setup();
    const { onClose } = renderOverlay("connected");

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("libera el inert de #root cuando pasa a un estado final", () => {
    renderOverlay("connected");
    // Sigue bloqueando #root -- el estado final TODAVÍA se está mostrando
    // (dismiss explícito pendiente), no es "idle" todavía.
    expect(appRoot.hasAttribute("inert")).toBe(true);
  });
});

describe("WhatsAppConexionOverlay — notConnected", () => {
  it("muestra un mensaje neutral (nunca alarmante) y botón Reintentar", async () => {
    const user = userEvent.setup();
    const { onClose } = renderOverlay("notConnected");

    expect(
      screen.getByText("No se detectó una conexión activa todavía. Podés intentarlo de nuevo."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clickear el backdrop en un estado final cierra el overlay", async () => {
    const user = userEvent.setup();
    const { onClose } = renderOverlay("notConnected");

    const dialogo = screen.getByRole("alertdialog");
    const backdrop = dialogo.parentElement as HTMLElement;
    await user.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("WhatsAppConexionOverlay — desmontaje", () => {
  it("libera el inert de #root al desmontarse", () => {
    const { unmount } = renderOverlay("waiting");
    expect(appRoot.hasAttribute("inert")).toBe(true);

    unmount();

    expect(appRoot.hasAttribute("inert")).toBe(false);
  });
});
