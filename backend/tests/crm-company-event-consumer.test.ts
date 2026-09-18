import { describe, expect, it, vi } from "vitest";
import {
  CrmCompanyEventConsumer,
  resolveServiceBusSettings,
  startCrmCompanyEventConsumer,
} from "../src/messaging/crm-company-event-consumer.js";

/**
 * holding-admin-gateway-auth (T5b): consumer wiring with a fake Service Bus
 * client/receiver (no broker involved): peekLock, manual settlement, log-only
 * `processError`, idempotent `close()`, and the "not configured" boot path.
 */
function fakeClient() {
  const receiver = {
    subscribe: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    completeMessage: vi.fn(),
    deadLetterMessage: vi.fn(),
    abandonMessage: vi.fn(),
  };
  const client = {
    createReceiver: vi.fn().mockReturnValue(receiver),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { client, receiver };
}

describe("CrmCompanyEventConsumer", () => {
  it("opens a peekLock receiver on the topic/subscription and subscribes without auto-complete", () => {
    const { client, receiver } = fakeClient();

    new CrmCompanyEventConsumer(client as never, "vimcore-domain-events", "crm-company-events").start();

    expect(client.createReceiver).toHaveBeenCalledWith("vimcore-domain-events", "crm-company-events", {
      receiveMode: "peekLock",
    });
    expect(receiver.subscribe).toHaveBeenCalledTimes(1);
    const [handlers, options] = receiver.subscribe.mock.calls[0] as [
      { processMessage: unknown; processError: (args: unknown) => Promise<void> },
      { autoCompleteMessages: boolean },
    ];
    expect(options).toEqual({ autoCompleteMessages: false });
    expect(typeof handlers.processMessage).toBe("function");
  });

  it("processError only logs: it neither throws nor settles anything", async () => {
    const { client, receiver } = fakeClient();
    new CrmCompanyEventConsumer(client as never, "t", "s").start();
    const [handlers] = receiver.subscribe.mock.calls[0] as [{ processError: (args: unknown) => Promise<void> }];

    await expect(
      handlers.processError({ entityPath: "t/s", errorSource: "receive", error: new Error("boom") }),
    ).resolves.toBeUndefined();

    expect(receiver.completeMessage).not.toHaveBeenCalled();
    expect(receiver.abandonMessage).not.toHaveBeenCalled();
  });

  it("close() is idempotent and closes the receiver before the client", async () => {
    const { client, receiver } = fakeClient();
    const consumer = new CrmCompanyEventConsumer(client as never, "t", "s");

    await consumer.close();
    await consumer.close();

    expect(receiver.close).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledTimes(1);
    expect(receiver.close.mock.invocationCallOrder[0]).toBeLessThan(client.close.mock.invocationCallOrder[0] as number);
  });

  it("close() never rejects even if the broker connection fails to close", async () => {
    const { client, receiver } = fakeClient();
    receiver.close.mockRejectedValue(new Error("already gone"));

    await expect(new CrmCompanyEventConsumer(client as never, "t", "s").close()).resolves.toBeUndefined();
  });
});

describe("resolveServiceBusSettings / startCrmCompanyEventConsumer", () => {
  const base = {
    SERVICE_BUS_TOPIC_NAME: "vimcore-domain-events",
    SERVICE_BUS_CRM_SUBSCRIPTION_NAME: "crm-company-events",
  };

  it("local mode needs the connection string", () => {
    expect(
      resolveServiceBusSettings({ ...base, SERVICE_BUS_MODE: "local", SERVICE_BUS_CONNECTION_STRING: "Endpoint=sb://x" }),
    ).toMatchObject({ mode: "local", connectionString: "Endpoint=sb://x" });
    expect(
      resolveServiceBusSettings({
        ...base,
        SERVICE_BUS_MODE: "local",
        SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE: "ns.servicebus.windows.net",
      }),
    ).toBeNull();
  });

  it("azure mode needs the fully qualified namespace", () => {
    expect(
      resolveServiceBusSettings({
        ...base,
        SERVICE_BUS_MODE: "azure",
        SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE: "ns.servicebus.windows.net",
      }),
    ).toMatchObject({ mode: "azure", fullyQualifiedNamespace: "ns.servicebus.windows.net" });
    expect(
      resolveServiceBusSettings({ ...base, SERVICE_BUS_MODE: "azure", SERVICE_BUS_CONNECTION_STRING: "Endpoint=sb://x" }),
    ).toBeNull();
  });

  it("does not create a consumer when the settings are missing (provisioning disabled)", () => {
    expect(startCrmCompanyEventConsumer(null)).toBeNull();
  });
});
