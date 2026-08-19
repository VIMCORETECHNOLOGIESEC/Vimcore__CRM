import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Notificacion } from "@/tipos/notificacion";
import {
  connectNotificacionesSse,
  SseParser,
} from "@/funcionalidades/notificaciones/notificaciones.sse";

const notificacion: Notificacion = {
  id: "notif-1",
  usuarioId: "u1",
  tipo: "INTERACCION_REPETIDA",
  canal: "IN_APP",
  titulo: "Interacción repetida",
  mensaje: "El lead volvió a escribir.",
  leadId: "lead-1",
  leidaEn: null,
  creadaEn: "2026-08-17T12:00:00.000Z",
};

function streamResponse(text: string): Response {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start: (controller) => { controller.enqueue(bytes); controller.close(); } }));
}

/** Como streamResponse, pero deja el stream abierto (sin EOF) para simular una conexión SSE viva. */
function openStreamResponse(text: string): Response {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start: (controller) => { controller.enqueue(bytes); } }));
}

describe("SseParser", () => {
  it("espera el frame completo entre chunks, ignora comentarios y une data multilínea", () => {
    const parser = new SseParser();

    expect(parser.push(": heartbeat\r\nid: evt-1\r\nevent: demo\r\ndata: uno\r\n")).toEqual([]);
    expect(parser.push("data: dos\r\n\r\n")).toEqual([
      { id: "evt-1", event: "demo", data: "uno\ndos" },
    ]);
  });

  it("acepta límites LF, CRLF y CR sin despachar dos veces", () => {
    const parser = new SseParser();
    const frames = [
      ...parser.push("id: 1\nevent: a\ndata: {}\n\n"),
      ...parser.push("id: 2\r\nevent: b\r\ndata: {}\r\n\r\n"),
      ...parser.push("id: 3\revent: c\rdata: {}\r\r"),
    ];
    expect(frames.map(({ id, event }) => ({ id, event }))).toEqual([
      { id: "1", event: "a" },
      { id: "2", event: "b" },
      { id: "3", event: "c" },
    ]);
  });
});

describe("connectNotificacionesSse", () => {
  it("envía Last-Event-ID por header y entrega un evento conocido válido", async () => {
    const onEvent = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(
      streamResponse(`id: evt-2\nevent: notificacion.nueva\ndata: ${JSON.stringify(notificacion)}\n\n`),
    );

    const connection = connectNotificacionesSse({ cursor: "evt-1", onEvent, fetcher });

    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledWith("/eventos", expect.objectContaining({
      headers: { Accept: "text/event-stream", "Last-Event-ID": "evt-1" },
      signal: expect.any(AbortSignal),
    }));
    expect(connection.getCursor()).toBe("evt-2");
    connection.abort();
  });

  it("entrega un evento metricas.actualizadas en vez de descartarlo", async () => {
    const onEvent = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(
      streamResponse("id: evt-9\nevent: metricas.actualizadas\ndata: {}\n\n"),
    );

    const connection = connectNotificacionesSse({ onEvent, fetcher });

    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));
    expect(onEvent).toHaveBeenCalledWith({ id: "evt-9", type: "metricas.actualizadas", data: {} });
    expect(connection.getCursor()).toBe("evt-9");
    connection.abort();
  });

  it("un frame conocido malformado termina sin adelantar el cursor", async () => {
    const estados: string[] = [];
    const connection = connectNotificacionesSse({
      cursor: "evt-previo",
      onEvent: vi.fn(),
      onStateChange: (estado) => estados.push(estado),
      fetcher: vi.fn().mockResolvedValue(
        streamResponse("id: evt-malo\nevent: notificacion.nueva\ndata: {\n\n"),
      ),
    });

    await waitFor(() => expect(estados).toContain("terminal"));
    expect(connection.getCursor()).toBe("evt-previo");
    connection.abort();
  });

  it("acota los reintentos 5xx a 1/2/4/8/16 segundos y luego queda terminal", async () => {
    const delays: number[] = [];
    const estados: string[] = [];
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    connectNotificacionesSse({
      onEvent: vi.fn(),
      onStateChange: (estado) => estados.push(estado),
      fetcher,
      schedule: (callback, delay) => { delays.push(delay); queueMicrotask(callback); return 1; },
      clearSchedule: vi.fn(),
    });

    await waitFor(() => expect(estados.at(-1)).toBe("terminal"));
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it("una falla transitoria 5xx se recupera al reconectar y retoma la entrega de eventos", async () => {
    const estados: string[] = [];
    const onEvent = vi.fn();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        openStreamResponse(`id: evt-3\nevent: notificacion.nueva\ndata: ${JSON.stringify(notificacion)}\n\n`),
      );
    const connection = connectNotificacionesSse({
      onEvent,
      onStateChange: (estado) => estados.push(estado),
      fetcher,
      schedule: (callback, delay) => { queueMicrotask(callback); return delay; },
      clearSchedule: vi.fn(),
    });

    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));
    expect(estados).toEqual(["connecting", "reconnecting", "connected"]);
    expect(estados).not.toContain("terminal");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(connection.getCursor()).toBe("evt-3");
    connection.abort();
  });

  it("el abort intencional cancela el timer y no reconecta", async () => {
    let retry: (() => void) | undefined;
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const clearSchedule = vi.fn();
    const connection = connectNotificacionesSse({
      onEvent: vi.fn(), fetcher, clearSchedule,
      schedule: (callback) => { retry = callback; return 7; },
    });
    await waitFor(() => expect(retry).toBeTypeOf("function"));

    connection.abort();
    retry?.();

    await Promise.resolve();
    expect(clearSchedule).toHaveBeenCalledWith(7);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("no programa un retry si el reader termina después del cleanup", async () => {
    let close: (() => void) | undefined;
    const schedule = vi.fn();
    const response = new Response(new ReadableStream({
      start: (controller) => { close = () => controller.close(); },
    }));
    const connection = connectNotificacionesSse({
      onEvent: vi.fn(), schedule, fetcher: vi.fn().mockResolvedValue(response),
    });
    await waitFor(() => expect(close).toBeTypeOf("function"));
    connection.abort();
    close?.();
    await Promise.resolve();
    expect(schedule).not.toHaveBeenCalled();
  });
});
