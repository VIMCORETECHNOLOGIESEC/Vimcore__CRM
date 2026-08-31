import { describe, expect, it, vi } from "vitest";

/**
 * `whatsapp.api.ts` -- Paso 1-3 del contrato real
 * (`docs/contrato-frontend-whatsapp-api_mat_04.md`). Mismo patrón que
 * `bridges/bridges.api.test.ts`: `httpClient` mockeado, se verifica la
 * ruta/verbo/params/body exactos que manda cada función.
 */
vi.mock("@/api/httpClient", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const { httpClient } = await import("@/api/httpClient");
const {
  completarConexionWhatsAppApi,
  fetchWhatsAppCallbackApi,
  fetchWhatsAppConexionApi,
  iniciarConexionWhatsAppApi,
} = await import("@/funcionalidades/whatsapp/whatsapp.api");

const getMock = vi.mocked(httpClient.get);
const postMock = vi.mocked(httpClient.post);

describe("iniciarConexionWhatsAppApi — Paso 1 (GET /whatsapp/conectar)", () => {
  it("sin empresaId (actor sesión company), manda el param undefined (se omite en la query real)", async () => {
    getMock.mockResolvedValue({ authorizationUrl: "https://meta.example/oauth", expiraEn: "2026-08-30T10:00:00.000Z" });

    const resultado = await iniciarConexionWhatsAppApi(undefined);

    expect(getMock).toHaveBeenCalledWith("/whatsapp/conectar", { params: { empresaId: undefined } });
    expect(resultado).toEqual({ authorizationUrl: "https://meta.example/oauth", expiraEn: "2026-08-30T10:00:00.000Z" });
  });

  it("con empresaId (actor holding-wide), lo manda como query param", async () => {
    getMock.mockResolvedValue({ authorizationUrl: "https://meta.example/oauth", expiraEn: "2026-08-30T10:00:00.000Z" });

    await iniciarConexionWhatsAppApi("empresa-1");

    expect(getMock).toHaveBeenCalledWith("/whatsapp/conectar", { params: { empresaId: "empresa-1" } });
  });
});

describe("fetchWhatsAppCallbackApi — Paso 2 (GET /whatsapp/callback, público)", () => {
  it("reenvía code/state tal cual, sin Authorization (skipAuth)", async () => {
    getMock.mockResolvedValue({
      numeros: [{ wabaId: "waba-1", numeroTelefonoId: "num-1", numeroDisplay: "+54 9 11 1234-5678", verifiedName: "Empresa SA" }],
      seleccion: "blob-cifrado",
      expiraEn: "2026-08-30T10:05:00.000Z",
    });

    const resultado = await fetchWhatsAppCallbackApi({ code: "abc", state: "xyz" });

    expect(getMock).toHaveBeenCalledWith("/whatsapp/callback", {
      skipAuth: true,
      params: { code: "abc", state: "xyz", error: undefined, error_description: undefined },
    });
    expect(resultado.seleccion).toBe("blob-cifrado");
    expect(resultado.numeros).toHaveLength(1);
  });

  it("reenvía error/errorDescription/state en caso de cancelación en Meta", async () => {
    getMock.mockRejectedValue(new Error("boom"));

    await expect(
      fetchWhatsAppCallbackApi({ error: "access_denied", errorDescription: "El usuario canceló", state: "xyz" }),
    ).rejects.toThrow();

    expect(getMock).toHaveBeenCalledWith("/whatsapp/callback", {
      skipAuth: true,
      params: { code: undefined, state: "xyz", error: "access_denied", error_description: "El usuario canceló" },
    });
  });
});

describe("completarConexionWhatsAppApi — Paso 3 (POST /whatsapp/conexion)", () => {
  it("manda seleccion/numeroTelefonoId y devuelve la conexion (sin empresaId, sesión company)", async () => {
    postMock.mockResolvedValue({
      conexion: {
        id: "conexion-1",
        empresaId: "empresa-1",
        numeroTelefonoId: "num-1",
        numeroDisplay: "+54 9 11 1234-5678",
        wabaId: "waba-1",
        estado: "ACTIVA",
        creadoEn: "2026-08-30T10:10:00.000Z",
      },
    });

    const resultado = await completarConexionWhatsAppApi({ seleccion: "blob-cifrado", numeroTelefonoId: "num-1" });

    expect(postMock).toHaveBeenCalledWith("/whatsapp/conexion", {
      seleccion: "blob-cifrado",
      numeroTelefonoId: "num-1",
      empresaId: undefined,
    });
    expect(resultado.estado).toBe("ACTIVA");
  });

  it("con empresaId (actor holding-wide), lo incluye en el body", async () => {
    postMock.mockResolvedValue({
      conexion: {
        id: "conexion-1",
        empresaId: "empresa-1",
        numeroTelefonoId: "num-1",
        numeroDisplay: "+54 9 11 1234-5678",
        wabaId: "waba-1",
        estado: "ACTIVA",
        creadoEn: "2026-08-30T10:10:00.000Z",
      },
    });

    await completarConexionWhatsAppApi({ seleccion: "blob-cifrado", numeroTelefonoId: "num-1", empresaId: "empresa-1" });

    expect(postMock).toHaveBeenCalledWith("/whatsapp/conexion", {
      seleccion: "blob-cifrado",
      numeroTelefonoId: "num-1",
      empresaId: "empresa-1",
    });
  });
});

describe("fetchWhatsAppConexionApi — Paso 4 (GET /whatsapp/conexion)", () => {
  it("sin empresaId, devuelve la conexión activa tal cual", async () => {
    getMock.mockResolvedValue({
      conexion: {
        id: "conexion-1",
        empresaId: "empresa-1",
        numeroTelefonoId: "num-1",
        numeroDisplay: "+54 9 11 1234-5678",
        wabaId: "waba-1",
        estado: "ACTIVA",
        creadoEn: "2026-08-30T10:10:00.000Z",
      },
    });

    const resultado = await fetchWhatsAppConexionApi(undefined);

    expect(getMock).toHaveBeenCalledWith("/whatsapp/conexion", { params: { empresaId: undefined } });
    expect(resultado?.estado).toBe("ACTIVA");
  });

  it("con empresaId (actor holding-wide), lo manda como query param", async () => {
    getMock.mockResolvedValue({ conexion: null });

    const resultado = await fetchWhatsAppConexionApi("empresa-9");

    expect(getMock).toHaveBeenCalledWith("/whatsapp/conexion", { params: { empresaId: "empresa-9" } });
    expect(resultado).toBeNull();
  });

  it("devuelve null si nunca se conectó (resultado válido, no un error)", async () => {
    getMock.mockResolvedValue({ conexion: null });

    const resultado = await fetchWhatsAppConexionApi(undefined);

    expect(resultado).toBeNull();
  });
});
