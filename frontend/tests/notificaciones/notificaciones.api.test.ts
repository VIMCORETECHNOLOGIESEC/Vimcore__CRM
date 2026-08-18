import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/httpClient", () => ({
  httpClient: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

const { httpClient } = await import("@/api/httpClient");
const {
  fetchNotificacionesApi,
  markAllNotificacionesLeidasApi,
  markNotificacionLeidaApi,
} = await import("@/funcionalidades/notificaciones/notificaciones.api");
const { TIPO_NOTIFICACION_ETIQUETAS } = await import(
  "@/funcionalidades/notificaciones/catalogos"
);

const getMock = vi.mocked(httpClient.get);
const patchMock = vi.mocked(httpClient.patch);

const notificacion = {
  id: "notif-1",
  usuarioId: "usuario-servidor",
  tipo: "INTERACCION_REPETIDA" as const,
  canal: "IN_APP" as const,
  titulo: "Interacción repetida",
  mensaje: "El lead volvió a escribir.",
  leadId: "lead-1",
  leidaEn: null,
  creadaEn: "2026-08-17T12:00:00.000Z",
};

beforeEach(() => {
  getMock.mockReset();
  patchMock.mockReset();
});

describe("fetchNotificacionesApi — contrato M8", () => {
  it("envía exactamente soloNoLeidas=true, sin usuario, y desenvuelve el envelope", async () => {
    getMock.mockResolvedValue({ notificaciones: [notificacion] });

    const resultado = await fetchNotificacionesApi({ soloNoLeidas: true });

    expect(getMock).toHaveBeenCalledWith("/notificaciones", {
      params: { soloNoLeidas: true },
    });
    expect(resultado).toEqual([notificacion]);
  });

  it("envía exactamente soloNoLeidas=false por defecto y conserva listas vacías", async () => {
    getMock.mockResolvedValue({ notificaciones: [] });

    const resultado = await fetchNotificacionesApi();

    expect(getMock).toHaveBeenCalledWith("/notificaciones", {
      params: { soloNoLeidas: false },
    });
    expect(resultado).toEqual([]);
  });
});

describe("mutaciones de lectura — contrato M8", () => {
  it("marca una notificación por id sin cuerpo ni usuario", async () => {
    patchMock.mockResolvedValue(undefined);

    await markNotificacionLeidaApi("notif-9");

    expect(patchMock).toHaveBeenCalledWith("/notificaciones/notif-9/leer");
  });

  it("marca todas mediante la ruta masiva exacta sin cuerpo ni usuario", async () => {
    patchMock.mockResolvedValue(undefined);

    await markAllNotificacionesLeidasApi();

    expect(patchMock).toHaveBeenCalledWith("/notificaciones/leer-todas");
  });

  it("propaga el 404 autoritativo en vez de simular una lectura local", async () => {
    const error = new Error("Notificación no encontrada");
    patchMock.mockRejectedValue(error);

    await expect(markNotificacionLeidaApi("ajena")).rejects.toBe(error);
  });
});

it("incluye la etiqueta de INTERACCION_REPETIDA soportada por M8", () => {
  expect(TIPO_NOTIFICACION_ETIQUETAS.INTERACCION_REPETIDA).toBe("Interacción repetida");
});
