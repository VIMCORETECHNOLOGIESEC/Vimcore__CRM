import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `NotificarWhatsAppNoConectadoDialog.tsx` -- diálogo de aviso manual
 * Supervisor/Asesor -> administrador (`WhatsAppSinConexion.tsx`), mismo
 * patrón que `RestablecerPasswordDialog.tsx` (`react-hook-form` + `zod`).
 * Mockea la capa de datos (`notificaciones.api.ts`), no `httpClient`
 * directamente -- mismo criterio que `useNotificaciones.test.tsx`.
 */
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/funcionalidades/notificaciones/notificaciones.api", () => ({
  notificarWhatsAppNoConectadoApi: vi.fn(),
}));

const { toast } = await import("sonner");
const { notificarWhatsAppNoConectadoApi } = await import(
  "@/funcionalidades/notificaciones/notificaciones.api"
);
const { NotificarWhatsAppNoConectadoDialog } = await import(
  "@/funcionalidades/whatsapp/NotificarWhatsAppNoConectadoDialog"
);

const notificarMock = vi.mocked(notificarWhatsAppNoConectadoApi);

function renderDialog(onOpenChange = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NotificarWhatsAppNoConectadoDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

beforeEach(() => {
  notificarMock.mockReset();
  vi.clearAllMocks();
});

describe("NotificarWhatsAppNoConectadoDialog", () => {
  it("bloquea el envío con el mensaje vacío (requerido)", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByText("Escribe un mensaje para el administrador.")).toBeInTheDocument();
    expect(notificarMock).not.toHaveBeenCalled();
  });

  it("bloquea el envío con más de 500 caracteres", async () => {
    const user = userEvent.setup();
    renderDialog();

    const textarea = screen.getByLabelText("Mensaje para el administrador");
    await user.type(textarea, "a".repeat(501));
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(
      await screen.findByText("El mensaje no puede superar los 500 caracteres."),
    ).toBeInTheDocument();
    expect(notificarMock).not.toHaveBeenCalled();
  });

  it("al enviar con éxito, llama al endpoint, muestra el toast y cierra el diálogo", async () => {
    const user = userEvent.setup();
    notificarMock.mockResolvedValue([]);
    const { onOpenChange } = renderDialog();

    await user.type(
      screen.getByLabelText("Mensaje para el administrador"),
      "Necesitamos conectar WhatsApp.",
    );
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(notificarMock).toHaveBeenCalledWith("Necesitamos conectar WhatsApp."));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("Se notificó al administrador.");
  });

  it("Cancelar cierra el diálogo sin llamar al endpoint", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(notificarMock).not.toHaveBeenCalled();
  });
});
