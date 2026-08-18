import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { Notificacion } from "@/tipos/notificacion";
import {
  NotificacionToast,
  showNotificacionToast,
} from "@/funcionalidades/notificaciones/NotificacionToast";

vi.mock("sonner", () => ({ toast: { custom: vi.fn(), dismiss: vi.fn() } }));

const notification: Notificacion = {
  id: "n1", usuarioId: "u1", tipo: "LEAD_ASIGNADO", canal: "IN_APP",
  titulo: "Nuevo lead asignado", mensaje: "Se te asignó Elena.", leadId: "lead-1",
  leidaEn: null, creadaEn: "2026-08-17T12:00:00.000Z",
};

describe("NotificacionToast", () => {
  it("muestra título, mensaje y una acción de teclado solo si existe lead", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<NotificacionToast notificacion={notification} onNavigate={onNavigate} />);

    expect(screen.getByText("Nuevo lead asignado")).toBeInTheDocument();
    expect(screen.getByText("Se te asignó Elena.")).toBeInTheDocument();
    const action = screen.getByRole("button", { name: "Ver lead" });
    action.focus();
    await user.keyboard("{Enter}");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("no ofrece una acción inexistente cuando la notificación no tiene lead", () => {
    render(<NotificacionToast notificacion={{ ...notification, leadId: null }} onNavigate={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Ver lead" })).not.toBeInTheDocument();
  });

  it("publica un toast único, polite por Sonner y con duración exacta de cinco segundos", () => {
    showNotificacionToast(notification, vi.fn());
    expect(toast.custom).toHaveBeenCalledWith(expect.any(Function), {
      id: "notificacion-n1",
      duration: 5000,
    });
  });
});
