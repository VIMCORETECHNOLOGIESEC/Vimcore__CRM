import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Notificacion } from "@/tipos/notificacion";

// Sin mock de `AuthContext`: `useNotificaciones`/`CampanaNotificaciones` ya
// no dependen de `useAuth()` tras la integración -- el backend resuelve el
// usuario del JWT (ver `useNotificaciones.ts`).
vi.mock("@/funcionalidades/notificaciones/notificaciones.api", () => ({
  fetchNotificacionesApi: vi.fn(),
  markNotificacionLeidaApi: vi.fn(),
  markAllNotificacionesLeidasApi: vi.fn(),
}));

const { fetchNotificacionesApi, markNotificacionLeidaApi, markAllNotificacionesLeidasApi } =
  await import("@/funcionalidades/notificaciones/notificaciones.api");
const { CampanaNotificaciones } = await import(
  "@/funcionalidades/notificaciones/CampanaNotificaciones"
);

const fetchNotificacionesApiMock = vi.mocked(fetchNotificacionesApi);
const markNotificacionLeidaApiMock = vi.mocked(markNotificacionLeidaApi);
const markAllNotificacionesLeidasApiMock = vi.mocked(markAllNotificacionesLeidasApi);

function notificacionFake(overrides: Partial<Notificacion> = {}): Notificacion {
  return {
    id: "notif-1",
    usuarioId: "u1",
    tipo: "LEAD_ASIGNADO",
    canal: "IN_APP",
    titulo: "Nuevo lead asignado",
    mensaje: "Se te asignó el lead de Roberto Salazar.",
    leadId: "lead-01",
    leidaEn: null,
    creadaEn: new Date().toISOString(),
    ...overrides,
  };
}

function renderCampana() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <CampanaNotificaciones />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  markNotificacionLeidaApiMock.mockResolvedValue(undefined);
  markAllNotificacionesLeidasApiMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CampanaNotificaciones — contador de no leídas", () => {
  it("muestra el conteo de no leídas en el aria-label del botón", async () => {
    fetchNotificacionesApiMock.mockResolvedValue([
      notificacionFake({ id: "1", leidaEn: null }),
      notificacionFake({ id: "2", leidaEn: null }),
      notificacionFake({ id: "3", leidaEn: new Date().toISOString() }),
    ]);

    renderCampana();

    expect(
      await screen.findByRole("button", { name: "Notificaciones, 2 sin leer" }),
    ).toBeInTheDocument();
  });

  it("indica 'sin pendientes' cuando no hay notificaciones no leídas", async () => {
    fetchNotificacionesApiMock.mockResolvedValue([
      notificacionFake({ id: "1", leidaEn: new Date().toISOString() }),
    ]);

    renderCampana();

    expect(
      await screen.findByRole("button", { name: "Notificaciones, sin pendientes" }),
    ).toBeInTheDocument();
  });
});

describe("CampanaNotificaciones — panel desplegable", () => {
  it("lista las notificaciones y enlaza al lead relacionado", async () => {
    fetchNotificacionesApiMock.mockResolvedValue([
      notificacionFake({ id: "1", leadId: "lead-01", titulo: "Nuevo lead asignado" }),
    ]);
    const user = userEvent.setup();
    renderCampana();

    await user.click(await screen.findByRole("button", { name: /Notificaciones/ }));

    const enlace = await screen.findByRole("link", { name: /Nuevo lead asignado/ });
    expect(enlace).toHaveAttribute("href", "/leads/lead-01");
  });

  it("muestra estado vacío cuando no hay notificaciones", async () => {
    fetchNotificacionesApiMock.mockResolvedValue([]);
    const user = userEvent.setup();
    renderCampana();

    await user.click(await screen.findByRole("button", { name: /Notificaciones/ }));

    expect(await screen.findByText("No tienes notificaciones")).toBeInTheDocument();
  });

  it("muestra un mensaje de error accionable con reintento cuando falla la carga", async () => {
    fetchNotificacionesApiMock.mockRejectedValue(new Error("fallo de red"));
    const user = userEvent.setup();
    renderCampana();

    await user.click(await screen.findByRole("button", { name: /Notificaciones/ }));

    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("CampanaNotificaciones — marcar como leída", () => {
  it("marca una notificación individual como leída sin navegar", async () => {
    fetchNotificacionesApiMock.mockResolvedValue([
      notificacionFake({ id: "1", leidaEn: null, leadId: null, titulo: "Error de bridge" }),
    ]);
    const user = userEvent.setup();
    renderCampana();

    await user.click(await screen.findByRole("button", { name: /Notificaciones/ }));
    await user.click(await screen.findByRole("button", { name: /Marcar "Error de bridge" como leída/ }));

    await waitFor(() => {
      expect(markNotificacionLeidaApiMock).toHaveBeenCalledWith("1");
    });
  });

  it("marca todas las notificaciones como leídas", async () => {
    fetchNotificacionesApiMock.mockResolvedValue([
      notificacionFake({ id: "1", leidaEn: null }),
      notificacionFake({ id: "2", leidaEn: null }),
    ]);
    const user = userEvent.setup();
    renderCampana();

    await user.click(await screen.findByRole("button", { name: /Notificaciones/ }));
    await user.click(await screen.findByRole("button", { name: "Marcar todas como leídas" }));

    await waitFor(() => {
      expect(markAllNotificacionesLeidasApiMock).toHaveBeenCalledWith();
    });
  });

  it("deshabilita 'marcar todas como leídas' cuando no hay pendientes", async () => {
    fetchNotificacionesApiMock.mockResolvedValue([
      notificacionFake({ id: "1", leidaEn: new Date().toISOString() }),
    ]);
    const user = userEvent.setup();
    renderCampana();

    await user.click(await screen.findByRole("button", { name: /Notificaciones/ }));

    expect(await screen.findByRole("button", { name: "Marcar todas como leídas" })).toBeDisabled();
  });
});
