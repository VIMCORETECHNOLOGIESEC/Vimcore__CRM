import { randomUUID } from "node:crypto";

export type EventType =
  | "notificacion.nueva"
  | "lead.asignado"
  | "lead.etapa-cambiada"
  | "sincronizacion.requerida"
  | "metricas.actualizadas";

export interface BrokerEvent {
  id: string;
  type: EventType;
  data: unknown;
}

type EventSink = (event: BrokerEvent) => void;

interface EventBrokerOptions {
  bootNonce?: string;
  capacity?: number;
}

const DEFAULT_CAPACITY = 100;

export class EventBroker {
  private readonly bootNonce: string;
  private readonly capacity: number;
  private counter = 0;
  private readonly retained = new Map<string, BrokerEvent[]>();
  private readonly connections = new Map<string, Set<EventSink>>();

  constructor(options: EventBrokerOptions = {}) {
    this.bootNonce = options.bootNonce ?? randomUUID();
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
  }

  publish(userId: string, type: EventType, data: unknown): BrokerEvent {
    const event = this.createEvent(type, data);
    const retained = this.retained.get(userId) ?? [];
    retained.push(event);
    if (retained.length > this.capacity) retained.shift();
    this.retained.set(userId, retained);

    for (const sink of this.connections.get(userId) ?? []) {
      try {
        sink(event);
      } catch {
        this.removeConnection(userId, sink);
      }
    }
    return event;
  }

  subscribe(userId: string, lastEventId: string | undefined, sink: EventSink): () => void {
    if (lastEventId) {
      const retained = this.retained.get(userId) ?? [];
      const cursorIndex = retained.findIndex((event) => event.id === lastEventId);
      if (cursorIndex === -1) {
        sink(this.createEvent("sincronizacion.requerida", { motivo: "cursor_no_disponible" }));
      } else {
        for (const event of retained.slice(cursorIndex + 1)) sink(event);
      }
    }

    const connections = this.connections.get(userId) ?? new Set<EventSink>();
    connections.add(sink);
    this.connections.set(userId, connections);
    return () => this.removeConnection(userId, sink);
  }

  connectionCount(userId: string): number {
    return this.connections.get(userId)?.size ?? 0;
  }

  /**
   * M9 (docs/08-dashboard-kpis.md §5, "Actualización en tiempo real"): señal
   * liviana de "algo relevante cambió" — a diferencia de `publish`, NO
   * resuelve destinatarios por rol ni recalcula métricas acá. El backend
   * emite a TODO usuario con al menos una conexión SSE activa en este
   * instante (`this.connections.keys()`); el filtrado por alcance de rol ya
   * ocurre server-side en cada `GET /api/v1/metricas/*` cuando el frontend
   * hace refetch al recibir la señal. Un usuario sin conexión activa no
   * recibe nada retenido para este evento — aceptable porque el spec pide
   * que el frontend recargue incondicionalmente al reconectar, no que
   * dependa de eventos perdidos durante la desconexión.
   */
  broadcastAll(type: EventType, data: unknown): void {
    for (const userId of this.connections.keys()) {
      this.publish(userId, type, data);
    }
  }

  private createEvent(type: EventType, data: unknown): BrokerEvent {
    this.counter += 1;
    return { id: `${this.bootNonce}:${this.counter}`, type, data };
  }

  private removeConnection(userId: string, sink: EventSink): void {
    const connections = this.connections.get(userId);
    connections?.delete(sink);
    if (connections?.size === 0) this.connections.delete(userId);
  }
}

export const eventBroker = new EventBroker();
