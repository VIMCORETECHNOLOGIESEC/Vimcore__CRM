import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `useWhatsApp.ts` -- Pasos 1 y 4 del flujo de conexión (Pasos 2/3 ya
 * cubiertos indirectamente por `WhatsAppCallbackPage.test.tsx`). Mismo
 * patrón que `whatsapp.api.test.ts`: dependencias mockeadas, se verifica
 * comportamiento observable de cada hook.
 */
vi.mock("@/funcionalidades/whatsapp/whatsapp.api", () => ({
  iniciarConexionWhatsAppApi: vi.fn(),
  fetchWhatsAppConexionApi: vi.fn(),
  fetchWhatsAppCallbackApi: vi.fn(),
  completarConexionWhatsAppApi: vi.fn(),
}));
vi.mock("@/funcionalidades/whatsapp/whatsapp.utils", () => ({
  guardarEmpresaFlujo: vi.fn(),
  redirectTo: vi.fn(),
}));

const { iniciarConexionWhatsAppApi, fetchWhatsAppConexionApi } = await import(
  "@/funcionalidades/whatsapp/whatsapp.api"
);
const { guardarEmpresaFlujo, redirectTo } = await import("@/funcionalidades/whatsapp/whatsapp.utils");
const { useIniciarConexionWhatsApp, useWhatsAppConexionStatus, useWhatsAppEstadoActual } =
  await import("@/funcionalidades/whatsapp/useWhatsApp");

const iniciarConexionWhatsAppApiMock = vi.mocked(iniciarConexionWhatsAppApi);
const fetchWhatsAppConexionApiMock = vi.mocked(fetchWhatsAppConexionApi);
const guardarEmpresaFlujoMock = vi.mocked(guardarEmpresaFlujo);
const redirectToMock = vi.mocked(redirectTo);

let ultimoQueryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  ultimoQueryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={ultimoQueryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  iniciarConexionWhatsAppApiMock.mockReset();
  fetchWhatsAppConexionApiMock.mockReset();
  guardarEmpresaFlujoMock.mockReset();
  redirectToMock.mockReset();
});

describe("useIniciarConexionWhatsApp", () => {
  it("al resolver, guarda el empresaId usado pero NO redirige por su cuenta", async () => {
    iniciarConexionWhatsAppApiMock.mockResolvedValue({
      authorizationUrl: "https://meta.example/oauth",
      expiraEn: "2026-08-30T10:00:00.000Z",
    });

    const { result } = renderHook(() => useIniciarConexionWhatsApp(), { wrapper });
    result.current.mutate("empresa-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(guardarEmpresaFlujoMock).toHaveBeenCalledWith("empresa-1");
    expect(redirectToMock).not.toHaveBeenCalled();
    expect(result.current.data?.authorizationUrl).toBe("https://meta.example/oauth");
  });
});

describe("useWhatsAppConexionStatus — Paso 4 (GET /whatsapp/conexion)", () => {
  it("no dispara ningún request hasta que se llama mutate() explícitamente", () => {
    renderHook(() => useWhatsAppConexionStatus(), { wrapper });
    expect(fetchWhatsAppConexionApiMock).not.toHaveBeenCalled();
  });

  it("al invocarse, devuelve la conexión real (o null si no hay ninguna)", async () => {
    fetchWhatsAppConexionApiMock.mockResolvedValue(null);

    const { result } = renderHook(() => useWhatsAppConexionStatus(), { wrapper });
    result.current.mutate(undefined);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchWhatsAppConexionApiMock).toHaveBeenCalledWith(undefined);
    expect(result.current.data).toBeNull();
  });

  it("propaga el empresaId (actor holding-wide) tal cual", async () => {
    fetchWhatsAppConexionApiMock.mockResolvedValue({
      id: "conexion-1",
      empresaId: "empresa-9",
      numeroTelefonoId: "num-1",
      numeroDisplay: "+54 9 11 1234-5678",
      wabaId: "waba-1",
      estado: "ACTIVA",
      creadoEn: "2026-08-30T10:10:00.000Z",
    });

    const { result } = renderHook(() => useWhatsAppConexionStatus(), { wrapper });
    result.current.mutate("empresa-9");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchWhatsAppConexionApiMock).toHaveBeenCalledWith("empresa-9");
    expect(result.current.data?.estado).toBe("ACTIVA");
  });
});

describe("useWhatsAppEstadoActual — estado ACTUAL (GET /whatsapp/conexion), montada con la card", () => {
  it("dispara el request al montar, sin esperar ningún evento", async () => {
    fetchWhatsAppConexionApiMock.mockResolvedValue(null);

    renderHook(() => useWhatsAppEstadoActual(undefined), { wrapper });

    await waitFor(() => expect(fetchWhatsAppConexionApiMock).toHaveBeenCalledWith(undefined));
  });

  it("no dispara ningún request cuando enabled es false", () => {
    renderHook(() => useWhatsAppEstadoActual(undefined, { enabled: false }), { wrapper });
    expect(fetchWhatsAppConexionApiMock).not.toHaveBeenCalled();
  });

  it("devuelve la conexión activa cuando el backend confirma una", async () => {
    fetchWhatsAppConexionApiMock.mockResolvedValue({
      id: "conexion-1",
      empresaId: "empresa-1",
      numeroTelefonoId: "num-1",
      numeroDisplay: "+54 9 11 1234-5678",
      wabaId: "waba-1",
      estado: "ACTIVA",
      creadoEn: "2026-08-30T10:10:00.000Z",
    });

    const { result } = renderHook(() => useWhatsAppEstadoActual(undefined), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.estado).toBe("ACTIVA");
    expect(result.current.data?.numeroDisplay).toBe("+54 9 11 1234-5678");
  });

  /**
   * `LeadDetallePage.tsx` pasa `{ silent: true }` para que un error de esta
   * consulta (ej. sin permiso, red) no dispare el toast GLOBAL de
   * `queryClient.ts` encima de `WhatsAppSinConexion`, que ya es su propio
   * estado "calmo" esperado. Se verifica acá, a nivel de hook, que la
   * `query` registrada en el `QueryClient` real queda con `meta: { silent:
   * true }` -- el toast en sí lo dispara `queryClient.ts` (ya cubierto en
   * `tests/queryClient.test.ts`), no este hook.
   */
  it("con options.silent=true, registra la query con meta: { silent: true }", async () => {
    fetchWhatsAppConexionApiMock.mockResolvedValue(null);

    renderHook(() => useWhatsAppEstadoActual(undefined, { silent: true }), { wrapper });

    await waitFor(() => expect(fetchWhatsAppConexionApiMock).toHaveBeenCalledWith(undefined));

    const query = ultimoQueryClient
      .getQueryCache()
      .find({ queryKey: ["whatsapp-estado-actual", undefined] });
    expect(query?.meta).toEqual({ silent: true });
  });

  it("sin options.silent (uso normal de ConectarWhatsAppCard), la query NO lleva meta.silent", async () => {
    fetchWhatsAppConexionApiMock.mockResolvedValue(null);

    renderHook(() => useWhatsAppEstadoActual(undefined), { wrapper });

    await waitFor(() => expect(fetchWhatsAppConexionApiMock).toHaveBeenCalledWith(undefined));

    const query = ultimoQueryClient
      .getQueryCache()
      .find({ queryKey: ["whatsapp-estado-actual", undefined] });
    expect(query?.meta?.silent).toBeUndefined();
  });
});
