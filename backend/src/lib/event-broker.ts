import { randomUUID } from "node:crypto";

export type EventType =
  | "notificacion.nueva"
  | "lead.asignado"
  | "lead.etapa-cambiada"
  | "sincronizacion.requerida"
  | "metricas.actualizadas"
  // whatsappMessages: mensaje entrante o saliente nuevo sobre una
  // conversación con asesor asignado.
  | "whatsapp.mensaje-nuevo"
  // whatsappMessages: `Conversacion.asesorId` cambió (primera asignación,
  // ruteo hacia un Lead ya asignado, o reasignación por SLA vencido).
  | "whatsapp.conversacion-reasignada"
  // D-mensajería (leído/no leído): el usuario indicado en `data.usuarioId`
  // marcó como leída `data.conversacionId` -- solo le importa a ESE usuario
  // (sincroniza el badge entre sus propias pestañas/dispositivos), nunca
  // apaga el badge de otro rol que también mira la misma conversación (ver
  // `ConversacionLectura` en schema.prisma).
  | "whatsapp.conversacion-leida"
  // reportes (Bloque E, "Exportación PDF/XLSX"): progreso de un `ReporteJob`
  // en background (`jobs/reportes/reporte-generacion.job.ts`). Flujo UI:
  // botón "Generar" -> "reporte.iniciado" -> "Generando…" -> "reporte.listo"
  // (con `archivoUrl` de descarga) o "reporte.error" (con `error`).
  | "reporte.iniciado"
  | "reporte.listo"
  | "reporte.error"
  | "usuario.presencia-cambiada";

export interface BrokerEvent {
  id: string;
  type: EventType;
  data: unknown;
}

/**
 * holding-scoped-tenant-isolation (T5b): a holding subscriber carries its
 * `holdingId` (`null` = global subscriber, SUPER_ADMIN only). Publishers that
 * know the holding of the event's empresa pass it, and holding subscribers of
 * a different holding never receive that event.
 */
export type EventScope =
  | { sessionScope: "company"; empresaId: string }
  | { sessionScope: "holding"; empresaId: null; holdingId: string | null };

/**
 * `eventHolding === undefined`: the publisher did not tag the event (it is
 * addressed to one user, whose key already bounds the audience) -> deliver.
 * A global subscriber (`null`) receives everything; a company subscriber has
 * no holding (`undefined`) and is bounded by its empresa key.
 */
function holdingMayReceive(eventHolding: string | undefined, subscriberHolding: string | null | undefined): boolean {
  if (eventHolding === undefined) return true;
  if (subscriberHolding === null || subscriberHolding === undefined) return true;
  return subscriberHolding === eventHolding;
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
  // holding tag of a retained/published event and the holding of a subscriber sink.
  private readonly eventHolding = new WeakMap<BrokerEvent, string>();
  private readonly sinkHolding = new WeakMap<EventSink, string | null>();

  constructor(options: EventBrokerOptions = {}) {
    this.bootNonce = options.bootNonce ?? randomUUID();
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
  }

  publish(
    userId: string,
    type: EventType,
    data: unknown,
    empresaId: string | null,
    holdingId?: string,
  ): BrokerEvent {
    const event = this.createEvent(type, data);
    if (holdingId !== undefined) this.eventHolding.set(event, holdingId);
    const holdingKey = this.scopeKey(userId, { sessionScope: "holding", empresaId: null, holdingId: null });
    const targetKeys = empresaId === null
      ? [holdingKey]
      : [this.scopeKey(userId, { sessionScope: "company", empresaId }), holdingKey];
    for (const key of targetKeys) {
      const retained = this.retained.get(key) ?? [];
      retained.push(event);
      if (retained.length > this.capacity) retained.shift();
      this.retained.set(key, retained);

      for (const sink of this.connections.get(key) ?? []) {
        if (!this.sinkMayReceive(event, sink)) continue;
        try {
          sink(event);
        } catch {
          this.removeConnection(key, sink);
        }
      }
    }
    return event;
  }

  subscribe(
    userId: string,
    scope: EventScope,
    lastEventId: string | undefined,
    sink: EventSink,
  ): () => void {
    const key = this.scopeKey(userId, scope);
    const subscriberHolding = scope.sessionScope === "holding" ? scope.holdingId : undefined;
    if (lastEventId) {
      const retained = this.retained.get(key) ?? [];
      const cursorIndex = retained.findIndex((event) => event.id === lastEventId);
      if (cursorIndex === -1) {
        sink(this.createEvent("sincronizacion.requerida", { motivo: "cursor_no_disponible" }));
      } else {
        for (const event of retained.slice(cursorIndex + 1)) {
          if (holdingMayReceive(this.eventHolding.get(event), subscriberHolding)) sink(event);
        }
      }
    }

    if (scope.sessionScope === "holding") this.sinkHolding.set(sink, scope.holdingId);
    const connections = this.connections.get(key) ?? new Set<EventSink>();
    connections.add(sink);
    this.connections.set(key, connections);
    return () => this.removeConnection(key, sink);
  }

  connectionCount(userId: string, scope: EventScope): number {
    return this.connections.get(this.scopeKey(userId, scope))?.size ?? 0;
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
  broadcastAll(type: EventType, data: unknown, holdingId?: string): void {
    for (const [key, sinks] of this.connections) {
      const event = this.createEvent(type, data);
      if (holdingId !== undefined) this.eventHolding.set(event, holdingId);
      for (const sink of sinks) {
        if (!this.sinkMayReceive(event, sink)) continue;
        try {
          sink(event);
        } catch {
          this.removeConnection(key, sink);
        }
      }
    }
  }

  private sinkMayReceive(event: BrokerEvent, sink: EventSink): boolean {
    // Company sinks are absent from `sinkHolding` -> undefined -> bounded by their empresa key.
    return holdingMayReceive(this.eventHolding.get(event), this.sinkHolding.get(sink));
  }

  private createEvent(type: EventType, data: unknown): BrokerEvent {
    this.counter += 1;
    return { id: `${this.bootNonce}:${this.counter}`, type, data };
  }

  private scopeKey(userId: string, scope: EventScope): string {
    return scope.sessionScope === "holding"
      ? `${userId}\u0000holding`
      : `${userId}\u0000company\u0000${scope.empresaId}`;
  }

  private removeConnection(key: string, sink: EventSink): void {
    const connections = this.connections.get(key);
    connections?.delete(sink);
    if (connections?.size === 0) this.connections.delete(key);
  }
}

export const eventBroker = new EventBroker();
