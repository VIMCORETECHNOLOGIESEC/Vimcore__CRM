import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/httpClient", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/funcionalidades/configuracion-empresa/configuracion-empresa.api", () => ({
  CONFIGURACION_EMPRESA_DEFAULT: {
    nombre: "CRM Embudo de Leads",
    colorPrimario: "#1e2a5e",
    colorSecundario: "#2563eb",
    logoUrl: null,
  },
}));

const { httpClient } = await import("@/api/httpClient");
const { fetchMarcaPublicaApi, obtenerMarcaPublicaConFallback } = await import(
  "@/funcionalidades/configuracion-empresa/marca-publica.api"
);
const { CONFIGURACION_EMPRESA_DEFAULT } = await import(
  "@/funcionalidades/configuracion-empresa/configuracion-empresa.api"
);

const getMock = vi.mocked(httpClient.get);

beforeEach(() => {
  getMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("marca-publica.api", () => {
  it("fetchMarcaPublicaApi llama a GET /marca-publica sin adjuntar Authorization (skipAuth)", async () => {
    const respuesta = {
      nombre: "Arcano Motos",
      colorPrimario: "#111111",
      colorSecundario: "#222222",
      logoUrl: "https://cdn.arcanomotos.com/logo.svg",
    };
    getMock.mockResolvedValue(respuesta);

    const resultado = await fetchMarcaPublicaApi();

    expect(getMock).toHaveBeenCalledWith("/marca-publica", { skipAuth: true });
    expect(resultado).toEqual(respuesta);
  });

  describe("obtenerMarcaPublicaConFallback", () => {
    it("devuelve la respuesta real cuando el fetch resuelve a tiempo", async () => {
      const respuesta = {
        nombre: "Arcano Motos",
        colorPrimario: "#111111",
        colorSecundario: "#222222",
        logoUrl: null,
      };
      getMock.mockResolvedValue(respuesta);

      const resultado = await obtenerMarcaPublicaConFallback();

      expect(resultado).toEqual(respuesta);
    });

    it("cae al default de fábrica si el fetch resuelve con null (200 sin marca configurada)", async () => {
      getMock.mockResolvedValue(null);

      const resultado = await obtenerMarcaPublicaConFallback();

      expect(resultado).toEqual(CONFIGURACION_EMPRESA_DEFAULT);
    });

    it("cae al default de fábrica si el fetch falla", async () => {
      getMock.mockRejectedValue(new Error("network error"));

      const resultado = await obtenerMarcaPublicaConFallback();

      expect(resultado).toEqual(CONFIGURACION_EMPRESA_DEFAULT);
    });

    it("cae al default de fábrica si el fetch nunca resuelve dentro del timeout", async () => {
      vi.useFakeTimers();
      getMock.mockReturnValue(new Promise(() => {}));

      const promesa = obtenerMarcaPublicaConFallback();
      await vi.advanceTimersByTimeAsync(5000);
      const resultado = await promesa;

      expect(resultado).toEqual(CONFIGURACION_EMPRESA_DEFAULT);
      vi.useRealTimers();
    });
  });
});
