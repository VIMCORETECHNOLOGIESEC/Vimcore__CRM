import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    // Default: the broker confirms every publish synchronously (callback with
    // no error) -- crm-company-event-poison-loop (T3) tests that need a
    // failed/unconfirmed publish override this per-call with
    // `mockImplementationOnce` to invoke the callback with an Error instead.
    sendToQueue: vi.fn(
      (_queue: string, _content: Buffer, _options: unknown, callback?: (error: Error | null) => void) => {
        callback?.(null);
        return true;
      },
    ),
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
    // crm-company-event-poison-loop (T3): the parking queue is asserted too
    // (never bound to the exchange -- it only receives direct `sendToQueue`
    // copies), derived from the queue name, never redeclaring the existing
    // production queue's own arguments (that would PRECONDITION_FAILED).
    expect(fake.channel.assertQueue).toHaveBeenCalledWith("crm-company-events.dead", { durable: true });
    expect(fake.channel.bindQueue).toHaveBeenCalledWith("crm-company-events", "vimcore-domain-events", "");
    expect(fake.channel.bindQueue).toHaveBeenCalledTimes(1);
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

  it("parks a malformed JSON body (deadLetter) in the .dead queue instead of dropping it, then acks the original", async () => {
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
    await flushAsync();

    // crm-company-event-poison-loop (T3): a deadLetter decision is parked
    // (persistent, publisher-confirmed copy), never silently dropped via a
    // requeue=false nack -- `crm-company-events` has no DLX configured.
    expect(fake.channel.sendToQueue).toHaveBeenCalledWith(
      "crm-company-events.dead",
      message.content,
      expect.objectContaining({
        persistent: true,
        messageId: "msg-2",
        correlationId: "corr-2",
        headers: expect.objectContaining({
          "x-crm-dead-reason": "MalformedPayload",
          "x-crm-attempts": 1,
          "x-crm-source-queue": "crm-company-events",
        }),
      }),
      expect.any(Function),
    );
    expect(fake.channel.ack).toHaveBeenCalledWith(message);
    expect(fake.channel.nack).not.toHaveBeenCalled();
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
  const base = {
    RABBITMQ_EXCHANGE_NAME: "vimcore-domain-events",
    RABBITMQ_CRM_QUEUE_NAME: "crm-company-events",
    RABBITMQ_MAX_ATTEMPTS: 5,
    RABBITMQ_RETRY_BASE_DELAY_MS: 2000,
    RABBITMQ_CRM_DEAD_QUEUE_NAME: undefined,
  };

  it("returns null when RABBITMQ_URL is not set", () => {
    expect(resolveRabbitMqSettings({ ...base, RABBITMQ_URL: undefined })).toBeNull();
  });

  it("resolves the settings, including the bounded-retry and parking-queue config, when RABBITMQ_URL is set", () => {
    expect(resolveRabbitMqSettings({ ...base, RABBITMQ_URL: "amqp://guest:guest@localhost:5672" })).toEqual({
      url: "amqp://guest:guest@localhost:5672",
      exchangeName: "vimcore-domain-events",
      queueName: "crm-company-events",
      maxAttempts: 5,
      retryBaseDelayMs: 2000,
      deadQueueName: undefined,
    });
  });

  it("passes through an explicit RABBITMQ_CRM_DEAD_QUEUE_NAME override", () => {
    const resolved = resolveRabbitMqSettings({
      ...base,
      RABBITMQ_URL: "amqp://guest:guest@localhost:5672",
      RABBITMQ_CRM_DEAD_QUEUE_NAME: "custom-dead-queue",
    });
    expect(resolved?.deadQueueName).toBe("custom-dead-queue");
  });

  it("does not create a consumer when the settings are missing (provisioning disabled)", () => {
    expect(startCrmCompanyEventConsumer(null)).toBeNull();
  });
});

/**
 * crm-company-event-poison-loop (T2): the consumer used to nack every failure
 * with `requeue: true` unconditionally -- an unbounded, immediate requeue loop
 * on a permanently failing message (~100 errors/s in production). These tests
 * drive the failure through the handler's real "abandon" decision (a fake,
 * always-rejecting `provision` dependency -- no database needed) rather than
 * mocking `channel.ack`/`nack` to throw, since the retry mechanism itself also
 * calls `channel.ack` to settle the original message after republishing.
 */
describe("CrmCompanyEventConsumer — bounded retry with backoff, then dead-letter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const RETRY_SETTINGS = { ...SETTINGS, maxAttempts: 3, retryBaseDelayMs: 10 };

  function subscribedMessage(headers: Record<string, unknown> = {}) {
    const body = {
      companyId: "328204b6-0000-4000-8000-000000000001",
      legalName: "Acme SA",
      adminUserId: "328204b6-0000-4000-8000-000000000002",
      adminEmail: "ada@acme.test",
      adminFullName: "Ada Admin",
    };
    return {
      properties: {
        messageId: "msg-retry",
        correlationId: "corr-retry",
        headers: { eventType: "CompanyModuleSubscribed", module: "crm", ...headers },
      },
      content: Buffer.from(JSON.stringify(body)),
    };
  }

  function handlerDeps(provision: ReturnType<typeof vi.fn>) {
    return {
      provision,
      linkAuthUser: vi.fn(),
      revertUserEmail: vi.fn(),
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as unknown as ConstructorParameters<typeof CrmCompanyEventConsumer>[1];
  }

  it("retries a permanently failing message up to maxAttempts, then parks it exactly once (never a bare drop nack)", async () => {
    const fake = fakeAmqp();
    const provision = vi.fn().mockRejectedValue(new Error("postgres unreachable"));
    const consumer = new CrmCompanyEventConsumer(RETRY_SETTINGS, handlerDeps(provision));
    consumer.start();
    await fake.waitForSetup();
    const onMessage = fake.getConsumeCallback();

    let current = subscribedMessage();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      onMessage?.(current);
      // Fake timers also fake `setImmediate` (used by `flushAsync`), so flush
      // pending microtasks/immediates through the fake-timer clock instead.
      await vi.advanceTimersByTimeAsync(0);

      if (attempt < 3) {
        // Below maxAttempts: scheduled for retry, not settled yet.
        expect(fake.channel.nack).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(10 * 2 ** (attempt - 1));
        expect(fake.channel.sendToQueue).toHaveBeenNthCalledWith(
          attempt,
          RETRY_SETTINGS.queueName,
          current.content,
          expect.objectContaining({ headers: expect.objectContaining({ "x-crm-attempt": attempt }) }),
          expect.any(Function),
        );
        expect(fake.channel.ack).toHaveBeenCalledTimes(attempt);
        // Simulate the broker redelivering the republished copy.
        const [, , options] = fake.channel.sendToQueue.mock.calls[attempt - 1] as [string, Buffer, { headers: Record<string, unknown> }];
        current = subscribedMessage(options.headers);
      }
    }

    // crm-company-event-poison-loop (T3): the 3rd attempt (== maxAttempts) is
    // PARKED (persistent, publisher-confirmed copy to the .dead queue) rather
    // than dropped with a bare `nack(requeue=false)` -- the queue has no DLX,
    // so that used to lose the message entirely.
    expect(fake.channel.nack).not.toHaveBeenCalled();
    expect(fake.channel.sendToQueue).toHaveBeenCalledTimes(3);
    expect(fake.channel.sendToQueue).toHaveBeenNthCalledWith(
      3,
      "crm-company-events.dead",
      current.content,
      expect.objectContaining({
        persistent: true,
        headers: expect.objectContaining({
          "x-crm-dead-reason": "RetryAttemptsExhausted",
          "x-crm-attempts": 3,
          "x-crm-source-queue": "crm-company-events",
        }),
      }),
      expect.any(Function),
    );
    expect(fake.channel.ack).toHaveBeenCalledTimes(3);
    expect(fake.channel.ack).toHaveBeenNthCalledWith(3, current);
    expect(provision).toHaveBeenCalledTimes(3);
  });

  it("acks and stops retrying once the message succeeds on a retry", async () => {
    const fake = fakeAmqp();
    const provision = vi.fn().mockRejectedValueOnce(new Error("transient")).mockResolvedValue({
      outcome: "provisioned",
      holdingId: "holding-1",
      empresaId: "empresa-1",
      usuarioId: "usuario-1",
    });
    const consumer = new CrmCompanyEventConsumer(RETRY_SETTINGS, handlerDeps(provision));
    consumer.start();
    await fake.waitForSetup();
    const onMessage = fake.getConsumeCallback();

    const original = subscribedMessage();
    onMessage?.(original);
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.channel.nack).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10);
    const [, , options] = fake.channel.sendToQueue.mock.calls[0] as [string, Buffer, { headers: Record<string, unknown> }];
    expect(options.headers["x-crm-attempt"]).toBe(1);
    expect(fake.channel.ack).toHaveBeenCalledTimes(1);

    const redelivered = subscribedMessage(options.headers);
    onMessage?.(redelivered);
    await vi.advanceTimersByTimeAsync(0);

    expect(fake.channel.ack).toHaveBeenCalledTimes(2);
    expect(fake.channel.ack).toHaveBeenNthCalledWith(2, redelivered);
    expect(fake.channel.nack).not.toHaveBeenCalled();
    expect(fake.channel.sendToQueue).toHaveBeenCalledTimes(1);
    expect(provision).toHaveBeenCalledTimes(2);
  });

  it("never acks or drops the original when the retry republish is not confirmed by the broker: requeues after a delay instead", async () => {
    const fake = fakeAmqp();
    const provision = vi.fn().mockRejectedValue(new Error("postgres unreachable"));
    const consumer = new CrmCompanyEventConsumer(RETRY_SETTINGS, handlerDeps(provision));
    consumer.start();
    await fake.waitForSetup();
    const onMessage = fake.getConsumeCallback();
    const message = subscribedMessage();

    onMessage?.(message);
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.channel.nack).not.toHaveBeenCalled();

    fake.channel.sendToQueue.mockImplementationOnce(
      (_queue: string, _content: Buffer, _options: unknown, callback?: (error: Error | null) => void) => {
        callback?.(new Error("channel closed"));
        return true;
      },
    );
    // Fires scheduleRetry's timer -> republishRetry, whose confirm fails.
    await vi.advanceTimersByTimeAsync(10);
    expect(fake.channel.ack).not.toHaveBeenCalled();
    expect(fake.channel.nack).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RETRY_SETTINGS.retryBaseDelayMs);
    expect(fake.channel.nack).toHaveBeenCalledExactlyOnceWith(message, false, true);
    expect(fake.channel.ack).not.toHaveBeenCalled();
    expect(provision).toHaveBeenCalledTimes(1);
  });
});

/**
 * crm-company-event-poison-loop (T3): a message must NEVER be lost. Publishing
 * to the parking queue (`.dead`) is awaited for a real broker confirm before
 * the original is acked; if the broker never confirms it, the original is
 * neither acked nor dropped -- it is requeued (nack, requeue=true) after a
 * short delay instead.
 */
describe("CrmCompanyEventConsumer — parking never loses a message", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not ack or drop the original when the parking publish is not confirmed by the broker: requeues after a delay instead", async () => {
    const fake = fakeAmqp();
    fake.channel.sendToQueue.mockImplementationOnce(
      (_queue: string, _content: Buffer, _options: unknown, callback?: (error: Error | null) => void) => {
        callback?.(new Error("channel closed"));
        return true;
      },
    );
    const consumer = new CrmCompanyEventConsumer({ ...SETTINGS, retryBaseDelayMs: 10 });
    consumer.start();
    await fake.waitForSetup();
    const onMessage = fake.getConsumeCallback();
    const message = {
      properties: {
        messageId: "msg-park-fail",
        correlationId: "corr-park-fail",
        headers: { eventType: "CompanyModuleSubscribed", module: "crm" },
      },
      content: Buffer.from("not json"),
    };

    onMessage?.(message);
    await vi.advanceTimersByTimeAsync(0);

    expect(fake.channel.sendToQueue).toHaveBeenCalledWith(
      "crm-company-events.dead",
      message.content,
      expect.objectContaining({ headers: expect.objectContaining({ "x-crm-dead-reason": "MalformedPayload" }) }),
      expect.any(Function),
    );
    expect(fake.channel.ack).not.toHaveBeenCalled();
    expect(fake.channel.nack).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10);
    expect(fake.channel.nack).toHaveBeenCalledExactlyOnceWith(message, false, true);
    expect(fake.channel.ack).not.toHaveBeenCalled();
  });
});
