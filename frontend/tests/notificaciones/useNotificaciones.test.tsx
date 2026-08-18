import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/httpClient";
import type { Notificacion } from "@/tipos/notificacion";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/funcionalidades/autenticacion/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", nombre: "Ana", correo: "ana@crm.test", rol: "ASESOR" },
  }),
}));

vi.mock("@/funcionalidades/notificaciones/notificaciones.api", () => ({
  fetchNotificacionesApi: vi.fn(),
  markNotificacionLeidaApi: vi.fn(),
  markAllNotificacionesLeidasApi: vi.fn(),
}));

const { queryClient } = await import("@/api/queryClient");
const { toast } = await import("sonner");
const { fetchNotificacionesApi, markNotificacionLeidaApi } = await import(
  "@/funcionalidades/notificaciones/notificaciones.api"
);
const { useMarkNotificacionLeida, useNotificaciones } = await import(
  "@/funcionalidades/notificaciones/useNotificaciones"
);

const fetchMock = vi.mocked(fetchNotificacionesApi);
const markMock = vi.mocked(markNotificacionLeidaApi);

const unread: Notificacion = {
  id: "notif-1",
  usuarioId: "u1",
  tipo: "LEAD_ASIGNADO",
  canal: "IN_APP",
  titulo: "Nuevo lead",
  mensaje: "Se asignó un lead.",
  leadId: "lead-1",
  leidaEn: null,
  creadaEn: "2026-08-17T12:00:00.000Z",
};

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

describe("useNotificaciones", () => {
  it("consulta la clave del usuario autenticado y reenvía soloNoLeidas", async () => {
    fetchMock.mockResolvedValue([unread]);

    const { result } = renderHook(() => useNotificaciones({ soloNoLeidas: true }), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([unread]));
    expect(fetchMock).toHaveBeenCalledWith({ soloNoLeidas: true });
    expect(queryClient.getQueryData(["notificaciones", "u1"])).toEqual([unread]);
  });

  it("mantiene la notificación no leída y muestra el 404 cuando M8 rechaza una ajena", async () => {
    queryClient.setQueryData(["notificaciones", "u1"], [unread]);
    const invalidar = vi.spyOn(queryClient, "invalidateQueries");
    markMock.mockRejectedValue(
      new ApiError("notificacion_no_encontrada", 404, "Notificación no encontrada"),
    );
    const { result } = renderHook(() => useMarkNotificacionLeida(), { wrapper });

    act(() => result.current.mutate("notif-1"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<Notificacion[]>(["notificaciones", "u1"])?.[0].leidaEn).toBeNull();
    expect(invalidar).toHaveBeenCalledWith({
      queryKey: ["notificaciones", "u1"],
      exact: true,
    });
    expect(toast.error).toHaveBeenCalledWith("Notificación no encontrada");
  });

  it("tras una lectura exitosa invalida solo la clave autoritativa del usuario", async () => {
    markMock.mockResolvedValue(undefined);
    const invalidar = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useMarkNotificacionLeida(), { wrapper });

    act(() => result.current.mutate("notif-1"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(markMock).toHaveBeenCalledWith("notif-1");
    expect(invalidar).toHaveBeenCalledWith({
      queryKey: ["notificaciones", "u1"],
      exact: true,
    });
  });
});
