import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `ConectarWhatsAppCard` -- entrada del Paso 1 (`GET /whatsapp/conectar`,
 * `docs/contrato-frontend-whatsapp-api_mat_04.md`), montada dentro de
 * `BridgesPage.tsx`. Mismo patrón que
 * `tests/layouts/SalirVistaEmpresaButton.test.tsx`: `useAuth` mockeado,
 * `useVistaEmpresa` real sobre `MemoryRouter` (para probar el `?empresaId=`
 * de verdad, sin duplicar ese mecanismo).
 *
 * Desde el rediseño de popup+overlay: `window.open` mockeado (sin depender
 * de `window.location.assign` como camino feliz), `GET /whatsapp/conexion`
 * (Paso 4) mockeado para simular el estado REAL post-cierre del popup.
 * `#root` se crea a mano en cada test (mismo criterio que
 * `WhatsAppConexionOverlay.test.tsx`) para poder verificar `inert`.
 */
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/funcionalidades/whatsapp/whatsapp.api", () => ({
  iniciarConexionWhatsAppApi: vi.fn(),
  fetchWhatsAppConexionApi: vi.fn(),
}));
vi.mock("@/funcionalidades/whatsapp/whatsapp.utils", () => ({
  redirectTo: vi.fn(),
  guardarEmpresaFlujo: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { iniciarConexionWhatsAppApi, fetchWhatsAppConexionApi } = await import(
  "@/funcionalidades/whatsapp/whatsapp.api"
);
const { redirectTo, guardarEmpresaFlujo } = await import("@/funcionalidades/whatsapp/whatsapp.utils");
const { ConectarWhatsAppCard } = await import("@/funcionalidades/whatsapp/ConectarWhatsAppCard");

const iniciarConexionWhatsAppApiMock = vi.mocked(iniciarConexionWhatsAppApi);
const fetchWhatsAppConexionApiMock = vi.mocked(fetchWhatsAppConexionApi);
const redirectToMock = vi.mocked(redirectTo);
const guardarEmpresaFlujoMock = vi.mocked(guardarEmpresaFlujo);

let appRoot: HTMLDivElement;
let popupFalso: { closed: boolean; close: ReturnType<typeof vi.fn> };

function crearPopupFalso() {
  popupFalso = { closed: false, close: vi.fn(() => (popupFalso.closed = true)) };
  return popupFalso as unknown as Window;
}

function renderConRuta(searchParamsIniciales: string, sessionScope: "holding" | "company") {
  vi.mocked(useAuth).mockReturnValue({
    user: { sessionScope, rol: "ADMINISTRADOR" },
  } as never);

  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/bridges${searchParamsIniciales}`]}>
        <Routes>
          <Route path="/bridges" element={<ConectarWhatsAppCard />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  iniciarConexionWhatsAppApiMock.mockReset();
  fetchWhatsAppConexionApiMock.mockReset();
  redirectToMock.mockReset();
  guardarEmpresaFlujoMock.mockReset();

  appRoot = document.createElement("div");
  appRoot.id = "root";
  document.body.appendChild(appRoot);
});

afterEach(() => {
  vi.restoreAllMocks();
  appRoot.remove();
});

describe("ConectarWhatsAppCard — sesión company", () => {
  it("el botón está habilitado sin necesitar elegir empresa", () => {
    renderConRuta("", "company");
    expect(screen.getByRole("button", { name: "Conectar WhatsApp" })).toBeEnabled();
  });

  it("errores del Paso 1 muestran un mensaje accionable (nunca un código HTTP) y no abren nada", async () => {
    iniciarConexionWhatsAppApiMock.mockRejectedValue(
      new Error("No se pudo iniciar la conexión con WhatsApp. Intentá nuevamente más tarde."),
    );
    const user = userEvent.setup();
    renderConRuta("", "company");

    await user.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));

    expect(
      await screen.findByText("Ocurrió un error inesperado. Intentá nuevamente en unos segundos."),
    ).toBeInTheDocument();
    expect(redirectToMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("ConectarWhatsAppCard — sesión holding-wide", () => {
  it("sin ?empresaId en la URL, el botón está deshabilitado con una ayuda explicando por qué", () => {
    renderConRuta("", "holding");
    expect(screen.getByRole("button", { name: "Conectar WhatsApp" })).toBeDisabled();
    expect(screen.getByText(/elegí primero una empresa/i)).toBeInTheDocument();
  });
});

describe("ConectarWhatsAppCard — flujo de popup, camino feliz del navegador (no bloqueado)", () => {
  it("al hacer click: guarda el empresaId, abre el popup y muestra el overlay en estado de espera", async () => {
    iniciarConexionWhatsAppApiMock.mockResolvedValue({
      authorizationUrl: "https://meta.example/oauth",
      expiraEn: "2026-08-30T10:00:00.000Z",
    });
    vi.spyOn(window, "open").mockImplementation(() => crearPopupFalso());

    const user = userEvent.setup();
    renderConRuta("?empresaId=empresa-9", "holding");

    await user.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));

    expect(iniciarConexionWhatsAppApiMock).toHaveBeenCalledWith("empresa-9");
    await vi.waitFor(() => expect(guardarEmpresaFlujoMock).toHaveBeenCalledWith("empresa-9"));
    expect(window.open).toHaveBeenCalledWith(
      "https://meta.example/oauth",
      "oauth-popup",
      expect.any(String),
    );
    expect(redirectToMock).not.toHaveBeenCalled();

    await screen.findByRole("alertdialog");
    expect(
      screen.getByText("Esperando a que completes la conexión en la otra ventana…"),
    ).toBeInTheDocument();
    expect(appRoot).toHaveAttribute("inert");
  });

  it("cerrar el popup a mano dispara la verificación real y muestra 'conectado' si el backend confirma una conexión activa", async () => {
    iniciarConexionWhatsAppApiMock.mockResolvedValue({
      authorizationUrl: "https://meta.example/oauth",
      expiraEn: "2026-08-30T10:00:00.000Z",
    });
    vi.spyOn(window, "open").mockImplementation(() => crearPopupFalso());
    fetchWhatsAppConexionApiMock.mockResolvedValue({
      id: "conexion-1",
      empresaId: "empresa-1",
      numeroTelefonoId: "num-1",
      numeroDisplay: "+54 9 11 1234-5678",
      wabaId: "waba-1",
      estado: "ACTIVA",
      creadoEn: "2026-08-30T10:10:00.000Z",
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderConRuta("", "company");
      await user.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
      await screen.findByRole("alertdialog");

      popupFalso.closed = true;
      await vi.advanceTimersByTimeAsync(500);

      await vi.waitFor(() =>
        expect(fetchWhatsAppConexionApiMock).toHaveBeenCalledWith(undefined),
      );
      await screen.findByText("La conexión se completó correctamente.");
      expect(appRoot).toHaveAttribute("inert");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cerrar el popup cuando el backend NO confirma conexión activa muestra un mensaje neutral, nunca alarmante", async () => {
    iniciarConexionWhatsAppApiMock.mockResolvedValue({
      authorizationUrl: "https://meta.example/oauth",
      expiraEn: "2026-08-30T10:00:00.000Z",
    });
    vi.spyOn(window, "open").mockImplementation(() => crearPopupFalso());
    fetchWhatsAppConexionApiMock.mockResolvedValue(null);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderConRuta("", "company");
      await user.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
      await screen.findByRole("alertdialog");

      popupFalso.closed = true;
      await vi.advanceTimersByTimeAsync(500);

      await screen.findByText(
        "No se detectó una conexión activa todavía. Podés intentarlo de nuevo.",
      );

      await user.click(screen.getByRole("button", { name: "Reintentar" }));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(appRoot).not.toHaveAttribute("inert");
    } finally {
      vi.useRealTimers();
    }
  });

  it("el botón Cancelar cierra el popup, lo que dispara la misma verificación real", async () => {
    iniciarConexionWhatsAppApiMock.mockResolvedValue({
      authorizationUrl: "https://meta.example/oauth",
      expiraEn: "2026-08-30T10:00:00.000Z",
    });
    vi.spyOn(window, "open").mockImplementation(() => crearPopupFalso());
    fetchWhatsAppConexionApiMock.mockResolvedValue(null);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderConRuta("", "company");
      await user.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
      await screen.findByRole("alertdialog");

      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(popupFalso.close).toHaveBeenCalledTimes(1);
      await screen.findByText(
        "No se detectó una conexión activa todavía. Podés intentarlo de nuevo.",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ConectarWhatsAppCard — popup bloqueado por el navegador", () => {
  it("hace fallback transparente al redirect de página completa, sin overlay ni error", async () => {
    iniciarConexionWhatsAppApiMock.mockResolvedValue({
      authorizationUrl: "https://meta.example/oauth",
      expiraEn: "2026-08-30T10:00:00.000Z",
    });
    vi.spyOn(window, "open").mockReturnValue(null);

    const user = userEvent.setup();
    renderConRuta("", "company");

    await user.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));

    await vi.waitFor(() =>
      expect(redirectToMock).toHaveBeenCalledWith("https://meta.example/oauth"),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
