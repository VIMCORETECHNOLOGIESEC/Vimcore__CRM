import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Notificacion } from "@/tipos/notificacion";

let userId = "u1";
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: () => ({ user: userId ? { id: userId } : null }),
}));
vi.mock("@/funcionalidades/notificaciones/notificaciones.sse", () => ({
  connectNotificacionesSse: vi.fn(),
}));

const { connectNotificacionesSse } = await import(
  "@/funcionalidades/notificaciones/notificaciones.sse"
);
const { useNotificacionesRealtime } = await import(
  "@/funcionalidades/notificaciones/useNotificacionesRealtime"
);
const connectMock = vi.mocked(connectNotificacionesSse);

const notification: Notificacion = {
  id: "n1", usuarioId: "u1", tipo: "LEAD_ASIGNADO", canal: "IN_APP",
  titulo: "Lead", mensaje: "Asignado", leadId: "lead-1", leidaEn: null,
  creadaEn: "2026-08-17T12:00:00.000Z",
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const aborts: ReturnType<typeof vi.fn>[] = [];
  let options: Parameters<typeof connectNotificacionesSse>[0] | undefined;
  connectMock.mockImplementation((value) => {
    options = value;
    const abort = vi.fn();
    aborts.push(abort);
    return { abort, retry: vi.fn(), getCursor: () => "" };
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const onNueva = vi.fn();
  const hook = renderHook(() => useNotificacionesRealtime(onNueva), { wrapper });
  return { client, aborts, onNueva, hook, get options() { return options!; } };
}

beforeEach(() => {
  userId = "u1";
  connectMock.mockReset();
});

it("upserta notificaciones por id sin duplicarlas y conserva orden descendente", () => {
  const context = setup();
  act(() => {
    context.options.onEvent({ type: "notificacion.nueva", data: notification, id: "e1" });
    context.options.onEvent({ type: "notificacion.nueva", data: { ...notification, titulo: "Actualizado" }, id: "e1" });
  });
  expect(context.client.getQueryData<Notificacion[]>(["notificaciones", "u1"])).toEqual([
    { ...notification, titulo: "Actualizado" },
  ]);
  expect(context.onNueva).toHaveBeenCalledTimes(2);
});

it("invalida los prefijos F3/F4 y resincroniza notificaciones, leads y detalles", () => {
  const context = setup();
  const invalidate = vi.spyOn(context.client, "invalidateQueries");
  act(() => {
    context.options.onEvent({ type: "lead.asignado", data: { leadId: "lead-1" }, id: "e2" });
    context.options.onEvent({ type: "lead.etapa-cambiada", data: { leadId: "lead-2" }, id: "e3" });
    context.options.onEvent({ type: "sincronizacion.requerida", data: {}, id: "e4" });
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["leads"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["lead-detalle", "lead-1"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["lead-detalle", "lead-2"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notificaciones", "u1"], exact: true });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["lead-detalle"] });
});

it("invalida metricas ante metricas.actualizadas sin caer en el catch-all genérico", () => {
  const context = setup();
  const invalidate = vi.spyOn(context.client, "invalidateQueries");
  act(() => {
    context.options.onEvent({ type: "metricas.actualizadas", data: {}, id: "e5" });
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["metricas"] });
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["notificaciones", "u1"], exact: true });
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["leads"] });
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["lead-detalle"] });
});

it("invalida la bandeja de reportes por jobId ante los 3 eventos de reporte, sin catch-all", () => {
  const context = setup();
  const invalidate = vi.spyOn(context.client, "invalidateQueries");
  act(() => {
    context.options.onEvent({ type: "reporte.iniciado", data: { jobId: "job-1", tipo: "pdf" }, id: "e6" });
    context.options.onEvent({
      type: "reporte.listo",
      data: { jobId: "job-1", archivoUrl: "/api/v1/reportes/jobs/job-1/descargar" },
      id: "e7",
    });
    context.options.onEvent({ type: "reporte.error", data: { jobId: "job-2", error: "boom" }, id: "e8" });
  });
  expect(invalidate).toHaveBeenCalledTimes(3);
  expect(invalidate).toHaveBeenNthCalledWith(1, { queryKey: ["reportes", "job-1"] });
  expect(invalidate).toHaveBeenNthCalledWith(2, { queryKey: ["reportes", "job-1"] });
  expect(invalidate).toHaveBeenNthCalledWith(3, { queryKey: ["reportes", "job-2"] });
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["notificaciones", "u1"], exact: true });
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["leads"] });
});

it("invalida la bandeja de conversaciones ante whatsapp.mensaje-nuevo sin tocar leads/notificaciones", () => {
  const context = setup();
  const invalidate = vi.spyOn(context.client, "invalidateQueries");
  act(() => {
    context.options.onEvent({ type: "whatsapp.mensaje-nuevo", data: { conversacionId: "conv-9" }, id: "e6" });
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["conversaciones", "conv-9", "mensajes"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["conversaciones"] });
  expect(invalidate).toHaveBeenCalledTimes(2);
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["notificaciones", "u1"], exact: true });
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["leads"] });
});

it("parchea la presencia del usuario en todas las queries de usuarios", () => {
  const context = setup();
  context.client.setQueryData(["usuarios", { pagina: 1 }], {
    users: [{
      id: "asesor-1",
      nombre: "Asesor Uno",
      correo: "asesor@crm.test",
      rol: "ASESOR",
      activo: true,
      creadoEn: "2026-09-01T09:00:00.000Z",
      actualizadoEn: "2026-09-01T09:00:00.000Z",
      empresas: [],
    }],
    total: 1,
    pagina: 1,
    limite: 20,
  });

  act(() => {
    context.options.onEvent({
      id: "e9",
      type: "usuario.presencia-cambiada",
      data: {
        usuarioId: "asesor-1",
        empresaId: "empresa-1",
        estado: "online",
        conectadoDesde: "2026-09-01T10:00:00.000Z",
        ultimaSenalEn: "2026-09-01T10:00:00.000Z",
        desconectadoEn: null,
        conexionesActivas: 1,
      },
    });
  });

  const data = context.client.getQueryData<{ users: Array<{ presencia?: { estado: string } }> }>(["usuarios", { pagina: 1 }]);
  expect(data?.users[0]?.presencia?.estado).toBe("online");
});

it("aborta la conexión vieja al cambiar usuario y al desmontar", () => {
  const context = setup();
  const firstAbort = context.aborts[0];
  userId = "u2";
  context.hook.rerender();
  expect(firstAbort).toHaveBeenCalledTimes(1);
  context.hook.unmount();
  const latestAbort = context.aborts.at(-1);
  expect(latestAbort).toHaveBeenCalledTimes(1);
});
