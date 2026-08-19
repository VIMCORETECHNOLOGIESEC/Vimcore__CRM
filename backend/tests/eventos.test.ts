import { EventEmitter } from "node:events";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { EventBroker, eventBroker } from "../src/lib/event-broker.js";
import { openEventStream } from "../src/services/eventos.service.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const password = "clave-eventos-123456";

async function createToken(): Promise<{ id: string; token: string }> {
  const user = await prisma.usuario.create({
    data: {
      nombre: "Usuario eventos",
      correo: `eventos-${crypto.randomUUID()}@test.local`,
      passwordHash: await hashPassword(password),
      rol: "ASESOR",
      activo: true,
    },
  });
  const response = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: user.correo, password });
  return { id: user.id, token: response.body.accessToken as string };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("M8 EventBroker", () => {
  it("delivers live events only to the recipient and supports sibling tabs", () => {
    const broker = new EventBroker({ bootNonce: "boot", capacity: 100 });
    const firstTab: string[] = [];
    const secondTab: string[] = [];
    const foreignTab: string[] = [];
    broker.subscribe("owner", undefined, (event) => firstTab.push(event.id));
    broker.subscribe("owner", undefined, (event) => secondTab.push(event.id));
    broker.subscribe("foreign", undefined, (event) => foreignTab.push(event.id));

    const published = broker.publish("owner", "notificacion.nueva", { id: "n-1" });

    expect(published.id).toBe("boot:1");
    expect(firstTab).toEqual(["boot:1"]);
    expect(secondTab).toEqual(["boot:1"]);
    expect(foreignTab).toEqual([]);
  });

  it("replays only later retained events in order for the same user", () => {
    const broker = new EventBroker({ bootNonce: "boot", capacity: 100 });
    const first = broker.publish("owner", "lead.asignado", { leadId: "l-1" });
    broker.publish("foreign", "lead.asignado", { leadId: "foreign" });
    broker.publish("owner", "lead.etapa-cambiada", { leadId: "l-1", etapa: "CONTACTADO" });
    broker.publish("owner", "notificacion.nueva", { id: "n-1" });
    const replayed: string[] = [];

    broker.subscribe("owner", first.id, (event) => replayed.push(event.id));

    expect(replayed).toEqual(["boot:3", "boot:4"]);
  });

  it("signals resynchronization for unknown and evicted cursors", () => {
    const broker = new EventBroker({ bootNonce: "new-boot", capacity: 2 });
    const evicted = broker.publish("owner", "lead.asignado", { leadId: "l-1" });
    broker.publish("owner", "lead.asignado", { leadId: "l-2" });
    broker.publish("owner", "lead.asignado", { leadId: "l-3" });
    const unknownFrames: string[] = [];
    const evictedFrames: string[] = [];

    broker.subscribe("owner", "old-boot:99", (event) => unknownFrames.push(event.type));
    broker.subscribe("owner", evicted.id, (event) => evictedFrames.push(event.type));

    expect(unknownFrames).toEqual(["sincronizacion.requerida"]);
    expect(evictedFrames).toEqual(["sincronizacion.requerida"]);
  });

  it("M9 broadcastAll delivers to every connected userId and skips disconnected ones (docs/08-dashboard-kpis.md §5)", () => {
    const broker = new EventBroker({ bootNonce: "boot", capacity: 100 });
    const connectedFrames: string[] = [];
    broker.subscribe("connected", undefined, (event) => connectedFrames.push(event.type));

    broker.broadcastAll("metricas.actualizadas", {});

    expect(connectedFrames).toEqual(["metricas.actualizadas"]);
    // Sin conexión activa, "disconnected" nunca entra a `connections.keys()`
    // — broadcastAll no le publica nada, ni siquiera lo retiene.
    const replayed: string[] = [];
    broker.subscribe("disconnected", undefined, (event) => replayed.push(event.type));
    expect(replayed).toEqual([]);
  });

  it("removes only a failed connection and leaves its sibling tab active", () => {
    const broker = new EventBroker({ bootNonce: "boot", capacity: 100 });
    const sibling: string[] = [];
    broker.subscribe("owner", undefined, () => {
      throw new Error("connection closed");
    });
    broker.subscribe("owner", undefined, (event) => sibling.push(event.id));

    broker.publish("owner", "notificacion.nueva", { id: "n-1" });
    broker.publish("owner", "notificacion.nueva", { id: "n-2" });

    expect(sibling).toEqual(["boot:1", "boot:2"]);
    expect(broker.connectionCount("owner")).toBe(1);
  });
});

describe("M8 SSE lifecycle", () => {
  it("writes SSE headers and heartbeat, then cleans up on close", () => {
    vi.useFakeTimers();
    const broker = new EventBroker({ bootNonce: "boot", capacity: 100 });
    const requestEvents = Object.assign(new EventEmitter(), { headers: {} });
    const responseEvents = new EventEmitter();
    const chunks: string[] = [];
    const response = Object.assign(responseEvents, {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn((chunk: string) => {
        chunks.push(chunk);
        return true;
      }),
    });

    openEventStream(requestEvents, response, "owner", broker, 25_000);
    expect(response.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
    expect(broker.connectionCount("owner")).toBe(1);

    vi.advanceTimersByTime(25_000);
    expect(chunks).toContain(": heartbeat\n\n");

    requestEvents.emit("close");
    expect(broker.connectionCount("owner")).toBe(0);
    vi.useRealTimers();
  });
});

describe("GET /api/v1/eventos", () => {
  it("opens a bearer-authenticated stream and replays from Last-Event-ID", async () => {
    const { id, token } = await createToken();
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");
    const firstAbort = new AbortController();
    const replayAbort = new AbortController();
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/eventos`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: firstAbort.signal,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");

      const firstEvent = eventBroker.publish(id, "notificacion.nueva", { id: "n-live" });
      const firstChunk = await response.body?.getReader().read();
      const firstFrame = new TextDecoder().decode(firstChunk?.value);
      expect(firstFrame).toContain("event: notificacion.nueva");
      expect(firstFrame).toContain('data: {"id":"n-live"}');
      firstAbort.abort();

      eventBroker.publish(id, "lead.asignado", { leadId: "lead-replay" });
      const replay = await fetch(`http://127.0.0.1:${address.port}/api/v1/eventos`, {
        headers: { Authorization: `Bearer ${token}`, "Last-Event-ID": firstEvent.id },
        signal: replayAbort.signal,
      });
      const replayChunk = await replay.body?.getReader().read();
      const replayFrame = new TextDecoder().decode(replayChunk?.value);
      expect(replayFrame).toContain("event: lead.asignado");
      expect(replayFrame).toContain('data: {"leadId":"lead-replay"}');
    } finally {
      firstAbort.abort();
      replayAbort.abort();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("rejects requests without a bearer token before streaming", async () => {
    const response = await request(app).get("/api/v1/eventos");
    expect(response.status).toBe(401);
  });

  it("rejects query-string tokens instead of treating them as authentication", async () => {
    const { token } = await createToken();
    const response = await request(app).get(`/api/v1/eventos?token=${token}`);
    expect(response.status).toBe(401);
  });
});
