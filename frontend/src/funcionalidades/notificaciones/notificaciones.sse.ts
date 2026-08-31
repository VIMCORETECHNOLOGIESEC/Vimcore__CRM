import { authenticatedFetch, type AuthenticatedFetchOptions } from "@/api/httpClient";
import type { Notificacion, TipoNotificacion } from "@/tipos/notificacion";

export type EstadoConexion = "idle" | "connecting" | "connected" | "reconnecting" | "terminal";
export interface SseFrame { id: string; event: string; data: string }
export type EventoNotificaciones =
  | { id: string; type: "notificacion.nueva"; data: Notificacion }
  | { id: string; type: "lead.asignado" | "lead.etapa-cambiada"; data: { leadId: string; [key: string]: unknown } }
  | { id: string; type: "sincronizacion.requerida"; data: unknown }
  | { id: string; type: "metricas.actualizadas"; data: Record<string, never> }
  | { id: string; type: "reporte.iniciado"; data: { jobId: string; tipo: "pdf" | "xlsx" } }
  | { id: string; type: "reporte.listo"; data: { jobId: string; archivoUrl: string } }
  | { id: string; type: "reporte.error"; data: { jobId: string; error: string } }
  | { id: string; type: "whatsapp.mensaje-nuevo"; data: { conversacionId: string } };

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000] as const;
const TIPOS_NOTIFICACION = new Set<TipoNotificacion>([
  "LEAD_ASIGNADO", "LEAD_TRASPASADO", "LEAD_SIN_ATENDER", "LEAD_SIN_ASIGNAR",
  "RECORDATORIO_CITA", "ERROR_BRIDGE", "INTERACCION_REPETIDA", "TOKEN_POR_EXPIRAR",
]);

/** Parser incremental: conserva texto incompleto y solo emite al recibir una línea vacía. */
export class SseParser {
  private pending = "";

  push(chunk: string): SseFrame[] {
    this.pending += chunk;
    const frames: SseFrame[] = [];
    let boundary = this.pending.match(/\r\n\r\n|\n\n|\r\r/);
    while (boundary?.index !== undefined) {
      const raw = this.pending.slice(0, boundary.index);
      this.pending = this.pending.slice(boundary.index + boundary[0].length);
      const parsed = this.parseFrame(raw);
      if (parsed) frames.push(parsed);
      boundary = this.pending.match(/\r\n\r\n|\n\n|\r\r/);
    }
    return frames;
  }

  private parseFrame(raw: string): SseFrame | null {
    let id = "";
    let event = "message";
    const data: string[] = [];
    for (const line of raw.split(/\r\n|\r|\n/)) {
      if (!line || line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const field = separator < 0 ? line : line.slice(0, separator);
      let value = separator < 0 ? "" : line.slice(separator + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "id" && !value.includes("\0")) id = value;
      if (field === "event") event = value;
      if (field === "data") data.push(value);
    }
    return data.length ? { id, event, data: data.join("\n") } : null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decodeKnownEvent(frame: SseFrame): EventoNotificaciones | null {
  const known = [
    "notificacion.nueva",
    "lead.asignado",
    "lead.etapa-cambiada",
    "sincronizacion.requerida",
    "metricas.actualizadas",
    "reporte.iniciado",
    "reporte.listo",
    "reporte.error",
    "whatsapp.mensaje-nuevo",
  ];
  if (!known.includes(frame.event)) return null;
  const data: unknown = JSON.parse(frame.data);
  if (frame.event === "notificacion.nueva") {
    if (!isRecord(data) || typeof data.id !== "string" || typeof data.usuarioId !== "string" ||
      typeof data.tipo !== "string" || !TIPOS_NOTIFICACION.has(data.tipo as TipoNotificacion) ||
      data.canal !== "IN_APP" || typeof data.titulo !== "string" || typeof data.mensaje !== "string" ||
      !(typeof data.leadId === "string" || data.leadId === null) ||
      !(typeof data.leidaEn === "string" || data.leidaEn === null) || typeof data.creadaEn !== "string") {
      throw new Error("evento_malformado");
    }
    return { id: frame.id, type: frame.event, data: data as unknown as Notificacion };
  }
  if (frame.event === "sincronizacion.requerida") return { id: frame.id, type: frame.event, data };
  if (frame.event === "metricas.actualizadas") return { id: frame.id, type: frame.event, data: {} };
  if (frame.event === "reporte.iniciado") {
    if (!isRecord(data) || typeof data.jobId !== "string" || (data.tipo !== "pdf" && data.tipo !== "xlsx")) {
      throw new Error("evento_malformado");
    }
    return { id: frame.id, type: frame.event, data: { jobId: data.jobId, tipo: data.tipo } };
  }
  if (frame.event === "reporte.listo") {
    if (!isRecord(data) || typeof data.jobId !== "string" || typeof data.archivoUrl !== "string") {
      throw new Error("evento_malformado");
    }
    return { id: frame.id, type: frame.event, data: { jobId: data.jobId, archivoUrl: data.archivoUrl } };
  }
  if (frame.event === "reporte.error") {
    if (!isRecord(data) || typeof data.jobId !== "string" || typeof data.error !== "string") {
      throw new Error("evento_malformado");
    }
    return { id: frame.id, type: frame.event, data: { jobId: data.jobId, error: data.error } };
  }
  if (frame.event === "whatsapp.mensaje-nuevo") {
    if (!isRecord(data) || typeof data.conversacionId !== "string") throw new Error("evento_malformado");
    return { id: frame.id, type: frame.event, data: { conversacionId: data.conversacionId } };
  }
  if (!isRecord(data) || typeof data.leadId !== "string") throw new Error("evento_malformado");
  return {
    id: frame.id,
    type: frame.event as "lead.asignado" | "lead.etapa-cambiada",
    data: data as { leadId: string; [key: string]: unknown },
  };
}

interface ConnectionOptions {
  cursor?: string;
  onEvent: (event: EventoNotificaciones) => void;
  onStateChange?: (state: EstadoConexion) => void;
  fetcher?: (path: string, options?: AuthenticatedFetchOptions) => Promise<Response>;
  schedule?: (callback: () => void, delay: number) => unknown;
  clearSchedule?: (handle: unknown) => void;
}

export interface NotificacionesSseConnection {
  abort: () => void;
  retry: () => void;
  getCursor: () => string;
}

/** Mantiene un stream bearer-only con cursor, retry acotado y cleanup generacional. */
export function connectNotificacionesSse(options: ConnectionOptions): NotificacionesSseConnection {
  const fetcher = options.fetcher ?? authenticatedFetch;
  const schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay));
  const clearSchedule = options.clearSchedule ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let cursor = options.cursor ?? "";
  let retries = 0;
  let active = true;
  let generation = 0;
  let timer: unknown;
  let controller = new AbortController();

  const setState = (state: EstadoConexion) => { if (active) options.onStateChange?.(state); };
  const scheduleRetry = (currentGeneration: number) => {
    if (retries >= RETRY_DELAYS.length) { setState("terminal"); return; }
    const delay = RETRY_DELAYS[retries++];
    setState("reconnecting");
    timer = schedule(() => {
      if (!active || generation !== currentGeneration) return;
      controller = new AbortController();
      void connect(currentGeneration);
    }, delay);
  };

  const connect = async (currentGeneration: number): Promise<void> => {
    try {
      const headers: Record<string, string> = { Accept: "text/event-stream" };
      if (cursor) headers["Last-Event-ID"] = cursor;
      const response = await fetcher("/eventos", { headers, signal: controller.signal });
      if (!active || generation !== currentGeneration) return;
      if (response.status === 401) { setState("idle"); return; }
      if (response.status >= 500) { scheduleRetry(currentGeneration); return; }
      if (!response.ok || !response.body) { setState("terminal"); return; }
      setState("connected");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SseParser();
      while (active && generation === currentGeneration) {
        const { done, value } = await reader.read();
        if (!active || generation !== currentGeneration) return;
        if (done) { scheduleRetry(currentGeneration); return; }
        for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
          const event = decodeKnownEvent(frame);
          if (frame.id) cursor = frame.id;
          retries = 0;
          if (event) options.onEvent(event);
        }
      }
    } catch (error) {
      if (!active || generation !== currentGeneration || (error instanceof DOMException && error.name === "AbortError")) return;
      if (error instanceof SyntaxError || (error instanceof Error && error.message === "evento_malformado")) {
        setState("terminal");
        return;
      }
      scheduleRetry(currentGeneration);
    }
  };

  const retry = () => {
    generation += 1;
    controller.abort();
    if (timer !== undefined) clearSchedule(timer);
    active = true;
    retries = 0;
    controller = new AbortController();
    setState("connecting");
    void connect(generation);
  };
  const abort = () => {
    active = false;
    generation += 1;
    controller.abort();
    if (timer !== undefined) clearSchedule(timer);
  };

  setState("connecting");
  void connect(generation);
  return { abort, retry, getCursor: () => cursor };
}
