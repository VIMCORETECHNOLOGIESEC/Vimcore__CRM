import { describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();
vi.mock("amqp-connection-manager", () => ({
  default: { connect: (...args: unknown[]) => connectMock(...(args as [])) },
}));

import {
  CrmCompanyEventConsumer,
  resolveRabbitMqSettings,
  startCrmCompanyEventConsumer,
} from "../src/messaging/crm-company-event-consumer.js";

/**
 * holding-admin-gateway-auth (T5b) / T4 (servicebus-to-rabbitmq-migration):
 * consumer wiring with a fake RabbitMQ connection manager/channel (no broker
 * involved): exchange/queue assert + bind, manual settlement (ack/nack), and
 * the "not configured" boot path. Full settlement decision routing (complete
 * / deadLetter / abandon) is covered against `decideCompanyEvent` directly in
 * `crm-company-event-handler.test.ts`.
 */
function fakeAmqp() {
  const channel = {
    assertExchange: vi.fn().mockResolvedValue(undefined),
    assertQueue: vi.fn().mockResolvedValue(undefined),
    bindQueue: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn((_queueName: string, cb: (message: unknown) => void) => {
      consumeCallback = cb;
      return Promise.resolve();
    }),
    ack: vi.fn(),
    nack: vi.fn(),
  };
  const channelWrapper = { close: vi.fn().mockResolvedValue(undefined) };
  let consumeCallback: ((message: unknown) => void) | undefined;
  let setupPromise: Promise<void> | undefined;
  const connectionManager = {
    on: vi.fn(),
    createChannel: vi.fn((options: { setup: (ch: typeof channel) => Promise<void> }) => {
      setupPromise = options.setup(channel);
      return channelWrapper;
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  connectMock.mockReturnValue(connectionManager);
  return {
    channel,
    channelWrapper,
    connectionManager,
    waitForSetup: () => setupPromise,
    getConsumeCallback: () => consumeCallback,
  };
}

const SETTINGS = { url: "amqp://guest:guest@localhost:5672", exchangeName: "vimcore-domain-events", queueName: "crm-company-events" };

// The consume callback is fire-and-forget (`void this.processMessage(...)`, same as
// amqplib idiom), so tests let its promise chain drain past pending microtasks before
// asserting on ack/nack.
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("CrmCompanyEventConsumer", () => {
  it("asserts the fanout exchange, the durable queue, binds it and consumes without auto-ack", async () => {
    const fake = fakeAmqp();

    new CrmCompanyEventConsumer(SETTINGS).start();
    await fake.waitForSetup();

    expect(connectMock).toHaveBeenCalledWith([SETTINGS.url]);
    expect(fake.channel.assertExchange).toHaveBeenCalledWith("vimcore-domain-events", "fanout", { durable: true });
    expect(fake.channel.assertQueue).toHaveBeenCalledWith("crm-company-events", { durable: true });
    expect(fake.channel.bindQueue).toHaveBeenCalledWith("crm-company-events", "vimcore-domain-events", "");
    expect(fake.channel.consume).toHaveBeenCalledWith("crm-company-events", expect.any(Function));
  });

  it("acks a message the handler completes (unknown module: nothing to do)", async () => {
    const fake = fakeAmqp();
    new CrmCompanyEventConsumer(SETTINGS).start();
    await fake.waitForSetup();
    const onMessage = fake.getConsumeCallback();

    onMessage?.({
      properties: { messageId: "msg-1", correlationId: "corr-1", headers: { eventType: "Other", module: "billing" } },
      content: Buffer.from("{}"),
    });
    await flushAsync();

    expect(fake.channel.ack).toHaveBeenCalledTimes(1);
    expect(fake.channel.nack).not.toHaveBeenCalled();
  });

  it("nacks without requeue for a malformed JSON body (deadLetter, no dead-letter infrastructure added)", async () => {
    const fake = fakeAmqp();
    new CrmCompanyEventConsumer(SETTINGS).start();
    await fake.waitForSetup();
    const onMessage = fake.getConsumeCallback();
    const message = {
      properties: { messageId: "msg-2", correlationId: "corr-2", headers: { eventType: "CompanyModuleSubscribed", module: "crm" } },
      content: Buffer.from("not json"),
    };

    onMessage?.(message);
    await flushAsync();

    expect(fake.channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(fake.channel.ack).not.toHaveBeenCalled();
  });

  it("close() is idempotent and closes the channel before the connection", async () => {
    const fake = fakeAmqp();
    const consumer = new CrmCompanyEventConsumer(SETTINGS);
    consumer.start();
    await fake.waitForSetup();

    await consumer.close();
    await consumer.close();

    expect(fake.channelWrapper.close).toHaveBeenCalledTimes(1);
    expect(fake.connectionManager.close).toHaveBeenCalledTimes(1);
    expect(fake.channelWrapper.close.mock.invocationCallOrder[0]).toBeLessThan(
      fake.connectionManager.close.mock.invocationCallOrder[0] as number,
    );
  });

  it("close() never rejects even if the broker connection fails to close", async () => {
    const fake = fakeAmqp();
    fake.channelWrapper.close.mockRejectedValue(new Error("already gone"));
    const consumer = new CrmCompanyEventConsumer(SETTINGS);
    consumer.start();
    await fake.waitForSetup();

    await expect(consumer.close()).resolves.toBeUndefined();
  });
});

describe("resolveRabbitMqSettings / startCrmCompanyEventConsumer", () => {
  const base = { RABBITMQ_EXCHANGE_NAME: "vimcore-domain-events", RABBITMQ_CRM_QUEUE_NAME: "crm-company-events" };

  it("returns null when RABBITMQ_URL is not set", () => {
    expect(resolveRabbitMqSettings({ ...base, RABBITMQ_URL: undefined })).toBeNull();
  });

  it("resolves the settings when RABBITMQ_URL is set", () => {
    expect(resolveRabbitMqSettings({ ...base, RABBITMQ_URL: "amqp://guest:guest@localhost:5672" })).toEqual({
      url: "amqp://guest:guest@localhost:5672",
      exchangeName: "vimcore-domain-events",
      queueName: "crm-company-events",
    });
  });

  it("does not create a consumer when the settings are missing (provisioning disabled)", () => {
    expect(startCrmCompanyEventConsumer(null)).toBeNull();
  });
});
