import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {},
  runAsSystem: vi.fn(<T>(fn: () => T) => fn()),
}));

import {
  calculateRetryDelayMs,
  OutboxPublisherLoop,
  startCrmOutboxPublisher,
} from "../src/messaging/outbox-publisher-loop.js";
import type { ClaimedOutboxMessage, OutboxRepository } from "../src/messaging/outbox.js";
import { ServiceBusMessagePublisher } from "../src/messaging/service-bus-message-publisher.js";

/**
 * crm-user-auth-provisioning (C1): Service Bus message shape, retry math, and
 * the loop's claim / publish / complete / fail transitions with a fake
 * repository and a fake sender (no broker, no database).
 */
const NOW = new Date("2026-09-21T12:00:00.000Z");

function message(overrides: Partial<ClaimedOutboxMessage> = {}): ClaimedOutboxMessage {
  return {
    id: "0b6e7a52-0000-4000-8000-000000000001",
    eventType: "CrmUserCreated",
    correlationId: "corr-1",
    payload: JSON.stringify({ crmUserId: "u-1" }),
    attemptCount: 1,
    ...overrides,
  };
}

function fakeRepository(claimed: ClaimedOutboxMessage[] = []) {
  return {
    claim: vi.fn().mockResolvedValue(claimed),
    completeClaim: vi.fn().mockResolvedValue({ outcome: "published" }),
    failClaim: vi.fn().mockResolvedValue({ outcome: "retry_scheduled" }),
  } satisfies OutboxRepository;
}

const silentLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe("ServiceBusMessagePublisher", () => {
  function fakeResources() {
    return {
      sender: { sendMessages: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) },
      client: { close: vi.fn().mockResolvedValue(undefined) },
    };
  }

  it("sends a JSON UTF-8 Buffer with the contract properties and the outbox id as messageId", async () => {
    const resources = fakeResources();
    const publisher = new ServiceBusMessagePublisher({ mode: "local", topicName: "t" }, resources);
    const signal = new AbortController().signal;

    await publisher.publish("CrmUserCreated", '{"crmUserId":"ñ-1"}', "corr-1", "msg-1", { abortSignal: signal });

    expect(resources.sender.sendMessages).toHaveBeenCalledTimes(1);
    const [sent, options] = resources.sender.sendMessages.mock.calls[0];
    expect(Buffer.isBuffer(sent.body)).toBe(true);
    expect(sent.body.toString("utf-8")).toBe('{"crmUserId":"ñ-1"}');
    expect(sent).toMatchObject({
      contentType: "application/json",
      messageId: "msg-1",
      correlationId: "corr-1",
      applicationProperties: { eventType: "CrmUserCreated", module: "crm", correlationId: "corr-1" },
    });
    expect(options).toEqual({ abortSignal: signal });
  });

  it("close() is idempotent and closes the sender before the client", async () => {
    const resources = fakeResources();
    const publisher = new ServiceBusMessagePublisher({ mode: "local", topicName: "t" }, resources);

    await Promise.all([publisher.close(), publisher.close()]);
    await publisher.close();

    expect(resources.sender.close).toHaveBeenCalledTimes(1);
    expect(resources.client.close).toHaveBeenCalledTimes(1);
    expect(resources.sender.close.mock.invocationCallOrder[0]).toBeLessThan(
      resources.client.close.mock.invocationCallOrder[0],
    );
  });
});

describe("calculateRetryDelayMs", () => {
  it("doubles per attempt and caps at maxMs", () => {
    expect(calculateRetryDelayMs({ attempt: 1, baseMs: 1_000, maxMs: 60_000 })).toBe(1_000);
    expect(calculateRetryDelayMs({ attempt: 3, baseMs: 1_000, maxMs: 60_000 })).toBe(4_000);
    expect(calculateRetryDelayMs({ attempt: 20, baseMs: 1_000, maxMs: 60_000 })).toBe(60_000);
  });

  it("subtracts up to jitterRatio of the delay", () => {
    expect(calculateRetryDelayMs({ attempt: 2, baseMs: 1_000, jitterRatio: 0.5, random: () => 1 })).toBe(1_000);
    expect(calculateRetryDelayMs({ attempt: 2, baseMs: 1_000, jitterRatio: 0.5, random: () => 0 })).toBe(2_000);
  });

  it("rejects invalid input", () => {
    expect(() => calculateRetryDelayMs({ attempt: 0 })).toThrow();
    expect(() => calculateRetryDelayMs({ attempt: 1, jitterRatio: 2 })).toThrow();
    expect(() => calculateRetryDelayMs({ attempt: 1, baseMs: 10, maxMs: 5 })).toThrow();
  });
});

describe("OutboxPublisherLoop", () => {
  const publisher = { publish: vi.fn() };
  const base = { intervalMs: 60_000, workerId: "w-1", now: () => NOW, random: () => 0, retryBaseMs: 1_000, retryJitterRatio: 0 };

  beforeEach(() => {
    vi.clearAllMocks();
    publisher.publish.mockResolvedValue(undefined);
  });

  it("claims with its settings, publishes each row with the outbox id and marks it published", async () => {
    const repo = fakeRepository([message(), message({ id: "id-2", correlationId: "corr-2" })]);
    const loop = new OutboxPublisherLoop(repo, publisher, { ...base, maxAttempts: 4, batchSize: 5, leaseMs: 9_000, logger: silentLogger() });

    await loop.tick();

    expect(repo.claim).toHaveBeenCalledWith({ workerId: "w-1", now: NOW, maxAttempts: 4, leaseMs: 9_000, batchSize: 5 });
    expect(publisher.publish).toHaveBeenCalledTimes(2);
    expect(publisher.publish).toHaveBeenCalledWith(
      "CrmUserCreated",
      JSON.stringify({ crmUserId: "u-1" }),
      "corr-1",
      "0b6e7a52-0000-4000-8000-000000000001",
      { abortSignal: expect.any(AbortSignal) },
    );
    expect(repo.completeClaim).toHaveBeenCalledWith({ id: "id-2", workerId: "w-1", publishedAt: NOW });
    expect(repo.failClaim).not.toHaveBeenCalled();
  });

  it("schedules a retry with exponential backoff when publishing fails", async () => {
    const repo = fakeRepository([message({ attemptCount: 3 })]);
    publisher.publish.mockRejectedValue(Object.assign(new Error("secret connection string"), { code: "ServiceUnavailable" }));
    const logger = silentLogger();
    const loop = new OutboxPublisherLoop(repo, publisher, { ...base, maxAttempts: 10, logger });

    await loop.tick();

    expect(repo.completeClaim).not.toHaveBeenCalled();
    expect(repo.failClaim).toHaveBeenCalledWith({
      id: "0b6e7a52-0000-4000-8000-000000000001",
      workerId: "w-1",
      // Bounded reason: error name + code, never the message.
      reason: "Error:ServiceUnavailable",
      retryAt: new Date(NOW.getTime() + 4_000),
      maxAttempts: 10,
    });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("retry scheduled"));
  });

  it("logs an error when the repository reports the row as terminally failed", async () => {
    const repo = fakeRepository([message({ attemptCount: 10 })]);
    repo.failClaim.mockResolvedValue({ outcome: "terminal_failed" });
    publisher.publish.mockRejectedValue(new Error("boom"));
    const logger = silentLogger();

    await new OutboxPublisherLoop(repo, publisher, { ...base, maxAttempts: 10, logger }).tick();

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("terminal failure"));
  });

  it("warns on stale completion and survives a failing failure-transition", async () => {
    const repo = fakeRepository([message()]);
    repo.completeClaim.mockResolvedValue({ outcome: "stale" });
    const logger = silentLogger();
    await new OutboxPublisherLoop(repo, publisher, { ...base, logger }).tick();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("completion stale"));

    publisher.publish.mockRejectedValue(new Error("x"));
    repo.failClaim.mockRejectedValue(new Error("db down"));
    await expect(new OutboxPublisherLoop(repo, publisher, { ...base, logger }).tick()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("failure transition failed"));
  });

  it("start() logs a claim failure instead of throwing, and stop() is idempotent", async () => {
    const repo = fakeRepository();
    repo.claim.mockRejectedValue(new Error("db down"));
    const logger = silentLogger();
    const loop = new OutboxPublisherLoop(repo, publisher, { ...base, logger });

    await expect(loop.start()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("claim failed"));

    const [first, second] = await Promise.all([loop.stop(), loop.stop()]);
    expect(first).toEqual({ outcome: "drained" });
    expect(second).toEqual({ outcome: "drained" });
  });

  it("stop() reports timed_out when the in-flight tick outlives the shutdown timeout", async () => {
    const repo = fakeRepository();
    repo.claim.mockReturnValue(new Promise(() => undefined));
    const loop = new OutboxPublisherLoop(repo, publisher, { ...base, shutdownTimeoutMs: 5, logger: silentLogger() });
    void loop.start();

    await expect(loop.stop()).resolves.toEqual({ outcome: "timed_out" });
  });

  it("runs each tick through runTick (runAsSystem in production)", async () => {
    const repo = fakeRepository();
    const runTick = vi.fn(<T>(fn: () => Promise<T>) => fn());
    await new OutboxPublisherLoop(repo, publisher, { ...base, runTick, logger: silentLogger() }).tick();
    expect(runTick).toHaveBeenCalledTimes(1);
  });
});

describe("startCrmOutboxPublisher", () => {
  it("returns null (CRM boots normally) when Service Bus is not configured", () => {
    const createPublisher = vi.fn();
    expect(startCrmOutboxPublisher({ settings: null, createPublisher })).toBeNull();
    expect(createPublisher).not.toHaveBeenCalled();
  });

  it("starts the loop and close() stops it and closes the publisher exactly once", async () => {
    const repo = fakeRepository();
    const fakePublisher = { publish: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
    const outbox = startCrmOutboxPublisher({
      settings: { mode: "local", connectionString: "Endpoint=sb://x", topicName: "vimcore-domain-events", subscriptionName: "s" },
      createPublisher: () => fakePublisher,
      repository: repo,
      intervalMs: 60_000,
    });

    expect(outbox).not.toBeNull();
    await Promise.all([outbox?.close(), outbox?.close()]);
    await outbox?.close();

    expect(fakePublisher.close).toHaveBeenCalledTimes(1);
  });

  it("returns null when the publisher cannot be built", () => {
    const outbox = startCrmOutboxPublisher({
      settings: { mode: "azure", fullyQualifiedNamespace: "ns.servicebus.windows.net", topicName: "t", subscriptionName: "s" },
      createPublisher: () => {
        throw new Error("no credentials");
      },
    });
    expect(outbox).toBeNull();
  });
});
