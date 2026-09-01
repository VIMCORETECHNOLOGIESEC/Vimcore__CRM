import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/httpClient";

/**
 * `WhatsAppCallbackPage` -- Paso 2 (`GET /whatsapp/callback`, público) +
 * Paso 3 (`POST /whatsapp/conexion`) resueltos en la misma pantalla, sin
 * navegar a una intermedia (contrato, secciones 2-3). Ruta pública (fuera de
 * `ProtectedRoute`, ver `router.tsx`) -- Meta redirige acá el navegador
 * directo, sin sesión SPA activa todavía necesariamente.
 */
vi.mock("@/funcionalidades/whatsapp/whatsapp.api", () => ({
  fetchWhatsAppCallbackApi: vi.fn(),
  completarConexionWhatsAppApi: vi.fn(),
}));
vi.mock("@/funcionalidades/whatsapp/whatsapp.utils", () => ({
  leerYLimpiarEmpresaFlujo: vi.fn(),
}));

const { fetchWhatsAppCallbackApi, completarConexionWhatsAppApi } = await import(
  "@/funcionalidades/whatsapp/whatsapp.api"
);
const { leerYLimpiarEmpresaFlujo } = await import("@/funcionalidades/whatsapp/whatsapp.utils");
const { WhatsAppCallbackPage } = await import("@/funcionalidades/whatsapp/WhatsAppCallbackPage");

const fetchWhatsAppCallbackApiMock = vi.mocked(fetchWhatsAppCallbackApi);
const completarConexionWhatsAppApiMock = vi.mocked(completarConexionWhatsAppApi);
const leerYLimpiarEmpresaFlujoMock = vi.mocked(leerYLimpiarEmpresaFlujo);

function renderConRuta(queryString: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/whatsapp/callback${queryString}`]}>
        <Routes>
          <Route path="/whatsapp/callback" element={<WhatsAppCallbackPage />} />
          <Route path="/bridges" element={<span>Marcador: volvimos a Bridges</span>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchWhatsAppCallbackApiMock.mockReset();
  completarConexionWhatsAppApiMock.mockReset();
  leerYLimpiarEmpresaFlujoMock.mockReset();
  leerYLimpiarEmpresaFlujoMock.mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WhatsAppCallbackPage — estados de carga y error del Paso 2", () => {
  it("muestra un esqueleto de carga mientras llega la respuesta del callback", async () => {
    let resolver: (value: unknown) => void = () => {};
    fetchWhatsAppCallbackApiMock.mockReturnValue(new Promise((resolve) => (resolver = resolve)));

    renderConRuta("?code=abc&state=xyz");

    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
    resolver({ numeros: [], seleccion: "blob", expiraEn: "2026-08-30T10:00:00.000Z" });
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Cargando" })).not.toBeInTheDocument(),
    );
  });

  it("reenvía code/state tal cual desde la URL al backend", async () => {
    fetchWhatsAppCallbackApiMock.mockResolvedValue({ numeros: [], seleccion: "blob", expiraEn: "2026-08-30T10:00:00.000Z" });
    renderConRuta("?code=abc123&state=xyz789");

    await waitFor(() =>
      expect(fetchWhatsAppCallbackApiMock).toHaveBeenCalledWith({
        code: "abc123",
        state: "xyz789",
        error: undefined,
        errorDescription: undefined,
      }),
    );
  });

  it("reenvía error/error_description en caso de cancelación en Meta", async () => {
    fetchWhatsAppCallbackApiMock.mockResolvedValue({ numeros: [], seleccion: "blob", expiraEn: "2026-08-30T10:00:00.000Z" });
    renderConRuta("?error=access_denied&error_description=El+usuario+canceló&state=xyz");

    await waitFor(() =>
      expect(fetchWhatsAppCallbackApiMock).toHaveBeenCalledWith({
        code: undefined,
        state: "xyz",
        error: "access_denied",
        errorDescription: "El usuario canceló",
      }),
    );
  });

  it("un error del backend (ej. state inválido/vencido) muestra un mensaje accionable y un botón para volver a intentar desde el Paso 1", async () => {
    fetchWhatsAppCallbackApiMock.mockRejectedValue(
      new ApiError("whatsapp_oauth_state_invalido", 401, "El enlace de conexión venció. Volvé a intentarlo."),
    );
    const user = userEvent.setup();
    renderConRuta("?code=abc&state=xyz");

    expect(await screen.findByText("El enlace de conexión venció. Volvé a intentarlo.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Marcador: volvimos a Bridges")).toBeInTheDocument();
  });
});

describe("WhatsAppCallbackPage — selección de número (Paso 2 exitoso)", () => {
  function callbackFake() {
    return {
      numeros: [
        { wabaId: "waba-1", numeroTelefonoId: "num-1", numeroDisplay: "+54 9 11 1234-5678", verifiedName: "Empresa SA" },
        { wabaId: "waba-1", numeroTelefonoId: "num-2", numeroDisplay: "+54 9 11 8765-4321", verifiedName: null },
      ],
      seleccion: "blob-cifrado",
      expiraEn: "2026-08-30T10:05:00.000Z",
    };
  }

  it("lista los números descubiertos y el botón de confirmar arranca deshabilitado", async () => {
    fetchWhatsAppCallbackApiMock.mockResolvedValue(callbackFake());
    renderConRuta("?code=abc&state=xyz");

    expect(await screen.findByText("+54 9 11 1234-5678")).toBeInTheDocument();
    expect(screen.getByText("+54 9 11 8765-4321")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conectar este número" })).toBeDisabled();
  });

  it("sin números descubiertos, muestra un estado vacío honesto en vez de una lista rota", async () => {
    fetchWhatsAppCallbackApiMock.mockResolvedValue({ numeros: [], seleccion: "blob", expiraEn: "2026-08-30T10:05:00.000Z" });
    renderConRuta("?code=abc&state=xyz");

    expect(
      await screen.findByText(/no se encontraron números de whatsapp business/i),
    ).toBeInTheDocument();
  });

  it("elegir un número y confirmar llama al Paso 3 con seleccion/numeroTelefonoId/empresaId guardado del Paso 1", async () => {
    fetchWhatsAppCallbackApiMock.mockResolvedValue(callbackFake());
    leerYLimpiarEmpresaFlujoMock.mockReturnValue("empresa-9");
    completarConexionWhatsAppApiMock.mockResolvedValue({
      id: "conexion-1",
      empresaId: "empresa-9",
      numeroTelefonoId: "num-1",
      numeroDisplay: "+54 9 11 1234-5678",
      wabaId: "waba-1",
      estado: "ACTIVA",
      creadoEn: "2026-08-30T10:10:00.000Z",
    });
    const user = userEvent.setup();
    renderConRuta("?code=abc&state=xyz");
    await screen.findByText("+54 9 11 1234-5678");

    await user.click(screen.getByRole("radio", { name: /\+54 9 11 1234-5678/ }));
    await user.click(screen.getByRole("button", { name: "Conectar este número" }));

    await waitFor(() =>
      expect(completarConexionWhatsAppApiMock).toHaveBeenCalledWith({
        seleccion: "blob-cifrado",
        numeroTelefonoId: "num-1",
        empresaId: "empresa-9",
      }),
    );
  });

  it("al completar el Paso 3, muestra la confirmación con el número conectado y permite volver", async () => {
    fetchWhatsAppCallbackApiMock.mockResolvedValue(callbackFake());
    completarConexionWhatsAppApiMock.mockResolvedValue({
      id: "conexion-1",
      empresaId: "empresa-9",
      numeroTelefonoId: "num-1",
      numeroDisplay: "+54 9 11 1234-5678",
      wabaId: "waba-1",
      estado: "ACTIVA",
      creadoEn: "2026-08-30T10:10:00.000Z",
    });
    const user = userEvent.setup();
    renderConRuta("?code=abc&state=xyz");
    await screen.findByText("+54 9 11 1234-5678");

    await user.click(screen.getByRole("radio", { name: /\+54 9 11 1234-5678/ }));
    await user.click(screen.getByRole("button", { name: "Conectar este número" }));

    expect(await screen.findByText(/whatsapp conectado/i)).toBeInTheDocument();
    expect(screen.getByText(/\+54 9 11 1234-5678/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Volver a Bridges" }));
    expect(await screen.findByText("Marcador: volvimos a Bridges")).toBeInTheDocument();
  });

  it("un error genérico del Paso 3 (ej. numero inválido) muestra un mensaje accionable y deja reintentar sin perder la lista", async () => {
    fetchWhatsAppCallbackApiMock.mockResolvedValue(callbackFake());
    completarConexionWhatsAppApiMock.mockRejectedValue(
      new ApiError("whatsapp_numero_invalido", 422, "Ese número ya no está disponible. Elige otro."),
    );
    const user = userEvent.setup();
    renderConRuta("?code=abc&state=xyz");
    await screen.findByText("+54 9 11 1234-5678");

    await user.click(screen.getByRole("radio", { name: /\+54 9 11 1234-5678/ }));
    await user.click(screen.getByRole("button", { name: "Conectar este número" }));

    expect(await screen.findByText("Ese número ya no está disponible. Elige otro.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conectar este número" })).toBeInTheDocument();
  });

  it("una selección vencida/alterada (401) fuerza a reiniciar el flujo desde el Paso 1", async () => {
    fetchWhatsAppCallbackApiMock.mockResolvedValue(callbackFake());
    completarConexionWhatsAppApiMock.mockRejectedValue(
      new ApiError("whatsapp_seleccion_invalida", 401, "La selección venció. Volvé a intentarlo."),
    );
    const user = userEvent.setup();
    renderConRuta("?code=abc&state=xyz");
    await screen.findByText("+54 9 11 1234-5678");

    await user.click(screen.getByRole("radio", { name: /\+54 9 11 1234-5678/ }));
    await user.click(screen.getByRole("button", { name: "Conectar este número" }));

    expect(await screen.findByText("La selección venció. Volvé a intentarlo.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Marcador: volvimos a Bridges")).toBeInTheDocument();
  });
});
