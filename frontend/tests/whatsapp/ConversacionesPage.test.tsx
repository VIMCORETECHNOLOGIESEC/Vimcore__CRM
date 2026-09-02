import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getErrorMessage } from "@/api/httpClient";
import type { ConversacionListItem, Mensaje } from "@/tipos/conversacion";

/**
 * `ConversacionesPage` -- bandeja de WhatsApp (listado + hilo + caja de
 * respuesta). `conversaciones.api` mockeado; el `MutationCache` del cliente de
 * test replica el toast global de error real (mismo criterio que
 * `tests/bridges/BridgesPage.test.tsx`). El tiempo real vive en el consumidor
 * central `useNotificacionesRealtime`, fuera de esta página.
 *
 * Fix (2026-09-02): `ConversacionesPage` ahora lee `useVistaEmpresa()` (fix
 * de la fuga de datos real de holding-wide, ver `ConversacionesPage.tsx`),
 * que internamente exige `useAuth()` -- sin mockearlo, cualquier render acá
 * tira "useAuth debe usarse dentro de <AuthProvider>". Mismo patrón que
 * `tests/bridges/BridgesPage.test.tsx`: mock directo del hook, sesión
 * `company` fija (ningún test de este archivo ejercita el drill-down de
 * vista de empresa en sí, así que alcanza con una sesión estable que nunca
 * dispara `enVistaDeEmpresa`).
 */
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: () => ({ user: { sessionScope: "company", rol: "ADMINISTRADOR" } }),
}));
vi.mock("@/funcionalidades/whatsapp/conversaciones.api", () => ({
  LIMITES_CONVERSACIONES: [10, 25, 50, 100],
  LONGITUD_MAXIMA_MENSAJE: 4096,
  listarConversacionesApi: vi.fn(),
  listarMensajesApi: vi.fn(),
  enviarMensajeApi: vi.fn(),
  marcarConversacionLeidaApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const api = await import("@/funcionalidades/whatsapp/conversaciones.api");
const { toast } = await import("sonner");
const { ConversacionesPage } = await import("@/funcionalidades/whatsapp/ConversacionesPage");

const listarConversacionesApiMock = vi.mocked(api.listarConversacionesApi);
const listarMensajesApiMock = vi.mocked(api.listarMensajesApi);
const enviarMensajeApiMock = vi.mocked(api.enviarMensajeApi);
const marcarConversacionLeidaApiMock = vi.mocked(api.marcarConversacionLeidaApi);
const toastErrorMock = vi.mocked(toast.error);

function conversacionFake(overrides: Partial<ConversacionListItem> = {}): ConversacionListItem {
  return {
    id: "conv-1",
    clienteId: "cli-1",
    clienteNombre: "Ana Gómez",
    clienteTelefono: "+54 9 11 5555-1234",
    asesorId: "u1",
    asesorNombre: "Carlos Ruiz",
    ultimoMensajeEn: "2026-08-30T10:05:00.000Z",
    creadaEn: "2026-08-29T09:00:00.000Z",
    noLeido: false,
    ...overrides,
  };
}

function mensajeFake(id: string, enviadoEn: string, overrides: Partial<Mensaje> = {}): Mensaje {
  return {
    id,
    conversacionId: "conv-1",
    direccion: "ENTRANTE",
    texto: `texto ${id}`,
    usuarioId: null,
    enviadoEn,
    ...overrides,
  };
}

function renderPage(initialPath = "/conversaciones") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: (error) => toast.error(getErrorMessage(error)) }),
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/conversaciones" element={<ConversacionesPage />} />
          <Route path="/conversaciones/:id" element={<ConversacionesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listarConversacionesApiMock.mockReset();
  listarMensajesApiMock.mockReset();
  enviarMensajeApiMock.mockReset();
  marcarConversacionLeidaApiMock.mockReset();
  toastErrorMock.mockReset();
  listarConversacionesApiMock.mockResolvedValue({ conversaciones: [conversacionFake()], total: 1 });
  listarMensajesApiMock.mockResolvedValue({ mensajes: [], total: 0 });
  marcarConversacionLeidaApiMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ConversacionesPage — listado (panel izquierdo)", () => {
  it("muestra las conversaciones cargadas", async () => {
    renderPage();
    expect(await screen.findByText("Ana Gómez")).toBeInTheDocument();
  });

  it("estado vacío honesto cuando no hay conversaciones", async () => {
    listarConversacionesApiMock.mockResolvedValue({ conversaciones: [], total: 0 });
    renderPage();
    expect(await screen.findByText("No hay conversaciones")).toBeInTheDocument();
  });

  it("muestra un esqueleto de carga mientras llega el listado", async () => {
    let resolver: (value: { conversaciones: ConversacionListItem[]; total: number }) => void = () => {};
    listarConversacionesApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );
    renderPage();

    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
    resolver({ conversaciones: [], total: 0 });
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Cargando" })).not.toBeInTheDocument(),
    );
  });

  it("marca visualmente las conversaciones no leídas (punto + texto en negrita)", async () => {
    listarConversacionesApiMock.mockResolvedValue({
      conversaciones: [
        conversacionFake({ id: "conv-1", clienteNombre: "Ana Gómez", noLeido: true }),
        conversacionFake({ id: "conv-2", clienteNombre: "Beto Ruiz", noLeido: false }),
      ],
      total: 2,
    });
    renderPage();

    const filaNoLeida = (await screen.findByText("Ana Gómez")).closest("a")!;
    expect(within(filaNoLeida).getByText("Ana Gómez")).toHaveClass("font-semibold");
    expect(filaNoLeida.querySelector('[data-testid="punto-no-leido"]')).toBeInTheDocument();

    const filaLeida = screen.getByText("Beto Ruiz").closest("a")!;
    expect(within(filaLeida).getByText("Beto Ruiz")).not.toHaveClass("font-semibold");
    expect(filaLeida.querySelector('[data-testid="punto-no-leido"]')).not.toBeInTheDocument();
  });

  it("al abrir una conversación no leída, la marca como leída en el backend", async () => {
    listarConversacionesApiMock.mockResolvedValue({
      conversaciones: [conversacionFake({ id: "conv-1", noLeido: true })],
      total: 1,
    });
    renderPage("/conversaciones/conv-1");

    await screen.findByTestId("encabezado-conversacion");

    await waitFor(() =>
      expect(marcarConversacionLeidaApiMock).toHaveBeenCalledWith("conv-1"),
    );
  });

  it("pasar de página vuelve a consultar con la página siguiente", async () => {
    listarConversacionesApiMock.mockResolvedValue({ conversaciones: [conversacionFake()], total: 30 });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ana Gómez");

    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() =>
      expect(listarConversacionesApiMock).toHaveBeenCalledWith({ pagina: 2, limite: 25 }),
    );
  });
});

describe("ConversacionesPage — hilo (panel derecho)", () => {
  it("sin conversación seleccionada muestra un marcador de posición", async () => {
    renderPage("/conversaciones");
    expect(
      await screen.findByText("Selecciona una conversación para ver los mensajes"),
    ).toBeInTheDocument();
  });

  it("con :id en el listado, arma la cabecera con los datos de esa fila", async () => {
    listarMensajesApiMock.mockResolvedValue({
      mensajes: [
        mensajeFake("m2", "2026-08-30T10:02:00.000Z", { texto: "Segundo mensaje" }),
        mensajeFake("m1", "2026-08-30T10:01:00.000Z", { texto: "Primer mensaje" }),
      ],
      total: 2,
    });
    renderPage("/conversaciones/conv-1");

    const cabecera = await screen.findByTestId("encabezado-conversacion");
    await waitFor(() =>
      expect(within(cabecera).getByText("Ana Gómez")).toBeInTheDocument(),
    );
    expect(within(cabecera).getByText(/\+54 9 11 5555-1234/)).toBeInTheDocument();
  });

  it("muestra los mensajes en orden de chat: el más viejo arriba", async () => {
    listarMensajesApiMock.mockResolvedValue({
      mensajes: [
        mensajeFake("m2", "2026-08-30T10:02:00.000Z", { texto: "Segundo mensaje" }),
        mensajeFake("m1", "2026-08-30T10:01:00.000Z", { texto: "Primer mensaje" }),
      ],
      total: 2,
    });
    renderPage("/conversaciones/conv-1");

    const burbujas = await screen.findAllByTestId("mensaje");
    expect(burbujas).toHaveLength(2);
    expect(burbujas[0]).toHaveTextContent("Primer mensaje");
    expect(burbujas[1]).toHaveTextContent("Segundo mensaje");
  });

  it("deep-link a un id que no está en la página del listado: cabecera mínima, hilo igual carga", async () => {
    renderPage("/conversaciones/conv-999");

    const cabecera = await screen.findByTestId("encabezado-conversacion");
    expect(within(cabecera).getByText("Conversación")).toBeInTheDocument();
    expect(
      await screen.findByText("Todavía no hay mensajes en esta conversación."),
    ).toBeInTheDocument();
    expect(listarMensajesApiMock).toHaveBeenCalledWith("conv-999", { pagina: 1, limite: 25 });
  });
});

describe("ConversacionesPage — caja de respuesta", () => {
  it("el botón de enviar arranca deshabilitado y se habilita al escribir", async () => {
    const user = userEvent.setup();
    renderPage("/conversaciones/conv-1");
    await screen.findByTestId("encabezado-conversacion");

    const boton = screen.getByRole("button", { name: "Enviar mensaje" });
    expect(boton).toBeDisabled();

    await user.type(screen.getByLabelText("Escribir mensaje"), "Hola");
    expect(boton).toBeEnabled();
  });

  it("un texto que supera el límite del backend deshabilita el envío y avisa", async () => {
    renderPage("/conversaciones/conv-1");
    await screen.findByTestId("encabezado-conversacion");

    fireEvent.change(screen.getByLabelText("Escribir mensaje"), {
      target: { value: "a".repeat(4097) },
    });

    expect(screen.getByText("El mensaje supera el límite de 4096 caracteres.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar mensaje" })).toBeDisabled();
  });

  it("envío exitoso: llama al backend con el texto recortado y limpia el campo", async () => {
    enviarMensajeApiMock.mockResolvedValue(
      mensajeFake("m9", "2026-08-30T10:09:00.000Z", { direccion: "SALIENTE", texto: "Hola" }),
    );
    const user = userEvent.setup();
    renderPage("/conversaciones/conv-1");
    await screen.findByTestId("encabezado-conversacion");

    const campo = screen.getByLabelText("Escribir mensaje");
    await user.type(campo, "  Hola  ");
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    await waitFor(() => expect(enviarMensajeApiMock).toHaveBeenCalledWith("conv-1", "Hola"));
    await waitFor(() => expect(campo).toHaveValue(""));
  });

  it("mientras el envío está en curso, el botón queda deshabilitado", async () => {
    let resolver: (value: Mensaje) => void = () => {};
    enviarMensajeApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPage("/conversaciones/conv-1");
    await screen.findByTestId("encabezado-conversacion");

    await user.type(screen.getByLabelText("Escribir mensaje"), "Hola");
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Enviar mensaje" })).toBeDisabled(),
    );
    resolver(mensajeFake("m9", "2026-08-30T10:09:00.000Z", { direccion: "SALIENTE", texto: "Hola" }));
  });

  it("error 422 del backend: muestra el mensaje accionable y conserva el texto", async () => {
    enviarMensajeApiMock.mockRejectedValue(
      new ApiError(
        "whatsapp_cliente_sin_telefono",
        422,
        "El cliente de la conversación no tiene un teléfono válido para recibir mensajes.",
      ),
    );
    const user = userEvent.setup();
    renderPage("/conversaciones/conv-1");
    await screen.findByTestId("encabezado-conversacion");

    const campo = screen.getByLabelText("Escribir mensaje");
    await user.type(campo, "Hola");
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "El cliente de la conversación no tiene un teléfono válido para recibir mensajes.",
      ),
    );
    expect(campo).toHaveValue("Hola");
  });

  it("error 503 del backend: también se surfacea el mensaje del backend", async () => {
    enviarMensajeApiMock.mockRejectedValue(
      new ApiError(
        "whatsapp_conexion_no_disponible",
        503,
        "No hay una conexión de WhatsApp activa para la empresa.",
      ),
    );
    const user = userEvent.setup();
    renderPage("/conversaciones/conv-1");
    await screen.findByTestId("encabezado-conversacion");

    await user.type(screen.getByLabelText("Escribir mensaje"), "Hola");
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "No hay una conexión de WhatsApp activa para la empresa.",
      ),
    );
  });
});
