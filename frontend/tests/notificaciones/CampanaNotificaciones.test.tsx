import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Notificacion } from "@/tipos/notificacion";

// `useNotificaciones.ts` sigue usando `useAuth()` para escopar la query key
// por `user.id` (ver esa nota en el propio hook): sin este mock, el `useAuth`
// real lanza porque este árbol no está envuelto en `<AuthProvider>`.
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", nombre: "Ana", correo: "ana@crm.test", rol: "ASESOR" },
  }),
}));

vi.mock("@/funcionalidades/notificaciones/notificaciones.api", () => ({
  fetchNotificacionesApi: vi.fn(),
  markNotificacionLeidaApi: vi.fn(),
  markAllNotificacionesLeidasApi: vi.fn(),
}));

const realtime = vi.hoisted(() => ({
  estado: "connected",
  reintentar: vi.fn(),
  onNueva: undefined as ((notificacion: Notificacion) => void) | undefined,
}));
vi.mock("@/funcionalidades/notificaciones/useNotificacionesRealtime", () => ({
  useNotificacionesRealtime: vi.fn((onNueva) => {
    realtime.onNueva = onNueva;
    return { estado: realtime.estado, reintentar: realtime.reintentar };
  }),
}));
vi.mock("@/funcionalidades/notificaciones/NotificacionToast", () => ({
  showNotificacionToast: vi.fn(),
}));

const { fetchNotificacionesApi, markNotificacionLeidaApi, markAllNotificacionesLeidasApi } =
  await import("@/funcionalidades/notificaciones/notificaciones.api");
const { CampanaNotificaciones } = await import(
  "@/funcionalidades/notificaciones/CampanaNotificaciones"
);
const { showNotificacionToast } = await import(
  "@/funcionalidades/notificaciones/NotificacionToast"
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
  realtime.estado = "connected";
  realtime.reintentar.mockReset();
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

describe("CampanaNotificaciones — estado del canal en tiempo real", () => {
  it("muestra una señal visible y polite al reconectar sin robar el foco", async () => {
    fetchNotificacionesApiMock.mockResolvedValue([]);
    realtime.estado = "reconnecting";
    const focusAnchor = document.createElement("button");
    document.body.append(focusAnchor);
    focusAnchor.focus();

    renderCampana();

    expect(await screen.findByRole("status")).toHaveTextContent("Reconectando notificaciones");
    expect(focusAnchor).toHaveFocus();
    focusAnchor.remove();
  });

  it("permite reintentar un estado terminal con teclado", async () => {
    fetchNotificacionesApiMock.mockResolvedValue([]);
    realtime.estado = "terminal";
    const user = userEvent.setup();
    renderCampana();
    const retry = await screen.findByRole("button", { name: "Reintentar notificaciones" });
    retry.focus();
    await user.keyboard("{Enter}");
    expect(realtime.reintentar).toHaveBeenCalledTimes(1);
  });

  it("envía cada notificación nueva al toast navegable", async () => {
    fetchNotificacionesApiMock.mockResolvedValue([]);
    renderCampana();
    const incoming = notificacionFake({ id: "nueva" });
    realtime.onNueva?.(incoming);
    expect(showNotificacionToast).toHaveBeenCalledWith(incoming, expect.any(Function));
  });
});
