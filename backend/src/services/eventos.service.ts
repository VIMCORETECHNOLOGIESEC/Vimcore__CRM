import type { Request, Response } from "express";
import { eventBroker, type BrokerEvent, type EventBroker, type EventScope } from "../lib/event-broker.js";

const HEARTBEAT_INTERVAL_MS = 25_000;

function serializeEvent(event: BrokerEvent): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function openEventStream(
  req: Pick<Request, "headers" | "once">,
  res: Pick<Response, "setHeader" | "flushHeaders" | "write" | "once">,
  userId: string,
  scope: EventScope,
  broker: EventBroker = eventBroker,
  heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const rawLastEventId = req.headers["last-event-id"];
  const lastEventId = Array.isArray(rawLastEventId) ? rawLastEventId[0] : rawLastEventId;
  const unsubscribe = broker.subscribe(userId, scope, lastEventId, (event) => {
    res.write(serializeEvent(event));
  });
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), heartbeatIntervalMs);

  let closed = false;
  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
  };
  req.once("close", cleanup);
  res.once("close", cleanup);
}
