import type { Notificacion } from "@prisma/client";
import { eventBroker, type EventType } from "../lib/event-broker.js";

export interface CommittedEvent {
  userId: string;
  empresaId: string | null;
  type: EventType;
  data: unknown;
}

export function notificationEvents(notification: Notificacion): CommittedEvent[] {
  return [{
    userId: notification.usuarioId,
    empresaId: notification.empresaId,
    type: "notificacion.nueva",
    data: notification,
  }];
}

export function publishCommittedEvents(events: readonly CommittedEvent[]): void {
  for (const event of events) {
    eventBroker.publish(event.userId, event.type, event.data, event.empresaId);
  }
}
