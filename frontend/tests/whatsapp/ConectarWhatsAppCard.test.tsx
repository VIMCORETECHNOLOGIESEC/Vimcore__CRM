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
 */
vi.mock("@/funcionalidades/autenticacion/authContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/funcionalidades/whatsapp/whatsapp.api", () => ({
  iniciarConexionWhatsAppApi: vi.fn(),
}));
vi.mock("@/funcionalidades/whatsapp/whatsapp.utils", () => ({
  redirectTo: vi.fn(),
  guardarEmpresaFlujo: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/authContext");
const { iniciarConexionWhatsAppApi } = await import("@/funcionalidades/whatsapp/whatsapp.api");
const { redirectTo, guardarEmpresaFlujo } = await import("@/funcionalidades/whatsapp/whatsapp.utils");
const { ConectarWhatsAppCard } = await import("@/funcionalidades/whatsapp/ConectarWhatsAppCard");

const iniciarConexionWhatsAppApiMock = vi.mocked(iniciarConexionWhatsAppApi);
const redirectToMock = vi.mocked(redirectTo);
const guardarEmpresaFlujoMock = vi.mocked(guardarEmpresaFlujo);

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
  redirectToMock.mockReset();
  guardarEmpresaFlujoMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConectarWhatsAppCard — sesión company", () => {
  it("el botón está habilitado sin necesitar elegir empresa", () => {
    renderConRuta("", "company");
    expect(screen.getByRole("button", { name: "Conectar WhatsApp" })).toBeEnabled();
  });

  it("al hacer click, inicia el Paso 1 sin empresaId y redirige a la authorizationUrl", async () => {
    iniciarConexionWhatsAppApiMock.mockResolvedValue({
      authorizationUrl: "https://meta.example/oauth",
      expiraEn: "2026-08-30T10:00:00.000Z",
    });
    const user = userEvent.setup();
    renderConRuta("", "company");

    await user.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));

    expect(iniciarConexionWhatsAppApiMock).toHaveBeenCalledWith(undefined);
    await vi.waitFor(() => expect(redirectToMock).toHaveBeenCalledWith("https://meta.example/oauth"));
    expect(guardarEmpresaFlujoMock).toHaveBeenCalledWith(undefined);
  });
});

describe("ConectarWhatsAppCard — sesión holding-wide", () => {
  it("sin ?empresaId en la URL, el botón está deshabilitado con una ayuda explicando por qué", () => {
    renderConRuta("", "holding");
    expect(screen.getByRole("button", { name: "Conectar WhatsApp" })).toBeDisabled();
    expect(screen.getByText(/elegí primero una empresa/i)).toBeInTheDocument();
  });

  it("con ?empresaId= en la URL, el botón está habilitado y manda ese empresaId al Paso 1", async () => {
    iniciarConexionWhatsAppApiMock.mockResolvedValue({
      authorizationUrl: "https://meta.example/oauth",
      expiraEn: "2026-08-30T10:00:00.000Z",
    });
    const user = userEvent.setup();
    renderConRuta("?empresaId=empresa-9", "holding");

    expect(screen.getByRole("button", { name: "Conectar WhatsApp" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));

    expect(iniciarConexionWhatsAppApiMock).toHaveBeenCalledWith("empresa-9");
    await vi.waitFor(() => expect(guardarEmpresaFlujoMock).toHaveBeenCalledWith("empresa-9"));
  });
});

describe("ConectarWhatsAppCard — errores del Paso 1 (400/503)", () => {
  it("muestra un mensaje accionable (nunca un código HTTP) cuando el Paso 1 falla", async () => {
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
  });
});
