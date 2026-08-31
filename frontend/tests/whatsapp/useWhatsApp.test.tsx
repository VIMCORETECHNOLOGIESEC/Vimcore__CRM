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
const { useIniciarConexionWhatsApp, useWhatsAppConexionStatus } = await import(
  "@/funcionalidades/whatsapp/useWhatsApp"
);

const iniciarConexionWhatsAppApiMock = vi.mocked(iniciarConexionWhatsAppApi);
const fetchWhatsAppConexionApiMock = vi.mocked(fetchWhatsAppConexionApi);
const guardarEmpresaFlujoMock = vi.mocked(guardarEmpresaFlujo);
const redirectToMock = vi.mocked(redirectTo);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
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
