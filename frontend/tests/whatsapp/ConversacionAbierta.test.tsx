import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ConversacionListItem, Mensaje } from "@/tipos/conversacion";

/**
 * `ConversacionAbierta` -- extraído de `ConversacionesPage.tsx` para
 * reutilizarlo desde otros anfitriones (WhatsApp del detalle de un lead).
 * Test mínimo: cabecera + hilo + envío siguen funcionando igual que cuando
 * vivía inline en `ConversacionesPage` (ya cubierto en detalle por
 * `ConversacionesPage.test.tsx`).
 */
vi.mock("@/funcionalidades/whatsapp/conversaciones.api", () => ({
  LIMITES_CONVERSACIONES: [10, 25, 50, 100],
  LONGITUD_MAXIMA_MENSAJE: 4096,
  listarConversacionesApi: vi.fn(),
  listarMensajesApi: vi.fn(),
  enviarMensajeApi: vi.fn(),
}));

const api = await import("@/funcionalidades/whatsapp/conversaciones.api");
const { ConversacionAbierta } = await import("@/funcionalidades/whatsapp/ConversacionAbierta");

const listarMensajesApiMock = vi.mocked(api.listarMensajesApi);
const enviarMensajeApiMock = vi.mocked(api.enviarMensajeApi);

function encabezadoFake(overrides: Partial<ConversacionListItem> = {}): ConversacionListItem {
  return {
    id: "conv-1",
    clienteId: "cli-1",
    clienteNombre: "Ana Gómez",
    clienteTelefono: "+54 9 11 5555-1234",
    asesorId: "u1",
    asesorNombre: "Carlos Ruiz",
    ultimoMensajeEn: "2026-08-30T10:05:00.000Z",
    creadaEn: "2026-08-29T09:00:00.000Z",
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

function renderComponente(encabezado?: ConversacionListItem) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ConversacionAbierta conversacionId="conv-1" encabezado={encabezado} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listarMensajesApiMock.mockReset();
  enviarMensajeApiMock.mockReset();
  listarMensajesApiMock.mockResolvedValue({ mensajes: [], total: 0 });
});

describe("ConversacionAbierta", () => {
  it("arma la cabecera a partir de la fila recibida y carga el hilo de esa conversación", async () => {
    listarMensajesApiMock.mockResolvedValue({
      mensajes: [mensajeFake("m1", "2026-08-30T10:01:00.000Z", { texto: "Hola" })],
      total: 1,
    });

    renderComponente(encabezadoFake());

    const cabecera = await screen.findByTestId("encabezado-conversacion");
    expect(within(cabecera).getByText("Ana Gómez")).toBeInTheDocument();
    expect(await screen.findByText("Hola")).toBeInTheDocument();
    expect(listarMensajesApiMock).toHaveBeenCalledWith("conv-1", { pagina: 1, limite: 25 });
  });

  it("sin encabezado, muestra una cabecera mínima honesta", async () => {
    renderComponente(undefined);

    const cabecera = await screen.findByTestId("encabezado-conversacion");
    expect(within(cabecera).getByText("Conversación")).toBeInTheDocument();
  });

  it("envía un mensaje con la caja de respuesta", async () => {
    enviarMensajeApiMock.mockResolvedValue(
      mensajeFake("m9", "2026-08-30T10:09:00.000Z", { direccion: "SALIENTE", texto: "Hola" }),
    );
    const user = userEvent.setup();
    renderComponente(encabezadoFake());
    await screen.findByTestId("encabezado-conversacion");

    await user.type(screen.getByLabelText("Escribir mensaje"), "Hola");
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    await waitFor(() => expect(enviarMensajeApiMock).toHaveBeenCalledWith("conv-1", "Hola"));
  });
});
