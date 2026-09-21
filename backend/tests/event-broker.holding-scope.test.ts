import { describe, expect, it } from "vitest";
import { EventBroker } from "../src/lib/event-broker.js";

/** holding-scoped-tenant-isolation (T5b): SSE fan-out respects the holding of the event. */
const HOLDING_A = "11111111-1111-4111-8111-111111111111";
const HOLDING_B = "22222222-2222-4222-8222-222222222222";

function subscribeHolding(broker: EventBroker, holdingId: string | null, lastEventId?: string) {
  const got: string[] = [];
  broker.subscribe("u1", { sessionScope: "holding", empresaId: null, holdingId }, lastEventId, (e) => got.push(e.id));
  return got;
}

describe("EventBroker — holding scoping", () => {
  it("a holding-A subscriber does not receive a holding-B event; holding-B and global subscribers do", () => {
    const broker = new EventBroker({ bootNonce: "t" });
    const a = subscribeHolding(broker, HOLDING_A);
    const b: string[] = [];
    broker.subscribe("u1", { sessionScope: "holding", empresaId: null, holdingId: HOLDING_B }, undefined, (e) => b.push(e.id));
    const global = subscribeHolding(broker, null);

    const event = broker.publish("u1", "notificacion.nueva", {}, "empresa-b", HOLDING_B);

    expect(a).toEqual([]);
    expect(b).toEqual([event.id]);
    expect(global).toEqual([event.id]);
  });

  it("untagged events (per-user addressed) still reach the user's holding subscriber", () => {
    const broker = new EventBroker({ bootNonce: "t" });
    const a = subscribeHolding(broker, HOLDING_A);
    const event = broker.publish("u1", "notificacion.nueva", {}, "empresa-a");
    expect(a).toEqual([event.id]);
  });

  it("replay after reconnect does not leak retained events of another holding", () => {
    const broker = new EventBroker({ bootNonce: "t", capacity: 10 });
    const first = broker.publish("u1", "notificacion.nueva", {}, null);
    broker.publish("u1", "notificacion.nueva", { x: 1 }, "empresa-b", HOLDING_B);
    const own = broker.publish("u1", "notificacion.nueva", { x: 2 }, "empresa-a", HOLDING_A);

    expect(subscribeHolding(broker, HOLDING_A, first.id)).toEqual([own.id]);
    expect(subscribeHolding(broker, null, first.id)).toHaveLength(2);
  });

  it("broadcastAll with a holding tag skips holding subscribers of other holdings", () => {
    const broker = new EventBroker({ bootNonce: "t" });
    const a = subscribeHolding(broker, HOLDING_A);
    const global = subscribeHolding(broker, null);
    broker.broadcastAll("metricas.actualizadas", {}, HOLDING_B);
    expect(a).toEqual([]);
    expect(global).toHaveLength(1);
    broker.broadcastAll("metricas.actualizadas", {});
    expect(a).toHaveLength(1);
  });
});
