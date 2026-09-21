import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { logger as defaultLogger } from "../lib/logger.js";
import { runAsSystem } from "../lib/prisma.js";
import {
  createPrismaOutboxRepository,
  OUTBOX_DEFAULT_BATCH_SIZE,
  OUTBOX_DEFAULT_LEASE_MS,
  OUTBOX_DEFAULT_MAX_ATTEMPTS,
  type ClaimedOutboxMessage,
  type OutboxRepository,
} from "./outbox.js";
import { resolveServiceBusSettings, type ServiceBusSettings } from "./crm-company-event-consumer.js";
import { ServiceBusMessagePublisher, type MessagePublisher } from "./service-bus-message-publisher.js";

/**
 * Exponential backoff (`baseMs * 2^(attempt-1)`, capped at `maxMs`) reduced by a
 * random jitter of up to `jitterRatio` so retries of many rows do not align.
 */
export function calculateRetryDelayMs(options: {
  attempt: number;
  baseMs?: number;
  maxMs?: number;
  jitterRatio?: number;
  random?: () => number;
}): number {
  const { attempt, baseMs = 5_000, maxMs = 15 * 60_000, jitterRatio = 0, random = Math.random } = options;
  if (!Number.isSafeInteger(attempt) || attempt <= 0) throw new Error("attempt must be a positive integer");
  if (!Number.isSafeInteger(baseMs) || baseMs <= 0) throw new Error("baseMs must be a positive integer");
  if (!Number.isSafeInteger(maxMs) || maxMs < baseMs) throw new Error("maxMs must be >= baseMs");
  if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) {
    throw new Error("jitterRatio must be between 0 and 1");
  }
  const randomValue = random();
  const capped = Math.min(maxMs, baseMs * 2 ** Math.min(attempt - 1, 30));
  return Math.round(capped * (1 - jitterRatio * randomValue));
}

interface LoopLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface OutboxPublisherLoopOptions {
  intervalMs: number;
  workerId?: string;
  maxAttempts?: number;
  batchSize?: number;
  leaseMs?: number;
  publishTimeoutMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  retryJitterRatio?: number;
  shutdownTimeoutMs?: number;
  now?: () => Date;
  random?: () => number;
  /** Wraps each tick (production: `runAsSystem`); identity by default. */
  runTick?: <T>(fn: () => Promise<T>) => Promise<T>;
  logger?: LoopLogger;
}

export interface OutboxStopResult {
  outcome: "drained" | "timed_out";
}

/** Bounded, secret-free failure reason persisted in `outbox_messages.last_error`. */
function boundedFailureReason(error: unknown, timedOut: boolean): string {
  if (timedOut) return "PublishTimeout";
  if (!(error instanceof Error)) return "PublishError";
  const code = (error as Error & { code?: unknown }).code;
  const reason = typeof code === "string" || typeof code === "number" ? `${error.name}:${code}` : error.name;
  return reason.slice(0, 120) || "PublishError";
}

/**
 * crm-user-auth-provisioning (C1): polls the outbox, claims due rows under a
 * lease and publishes them to Service Bus. A failed publish is retried with
 * exponential backoff + jitter until `maxAttempts`, then the row is `failed`.
 * Ticks never overlap; `stop()` is idempotent and waits (bounded) for the
 * in-flight tick.
 */
export class OutboxPublisherLoop {
  readonly workerId: string;
  private readonly maxAttempts: number;
  private readonly batchSize: number;
  private readonly leaseMs: number;
  private readonly publishTimeoutMs: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly retryJitterRatio: number;
  private readonly shutdownTimeoutMs: number;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly runTick: <T>(fn: () => Promise<T>) => Promise<T>;
  private readonly logger: LoopLogger;
  private timer: NodeJS.Timeout | null = null;
  private activeTick: Promise<void> | null = null;
  private accepting = false;
  private started = false;
  private stopPromise: Promise<OutboxStopResult> | null = null;

  constructor(
    private readonly outbox: OutboxRepository,
    private readonly publisher: Pick<MessagePublisher, "publish">,
    private readonly options: OutboxPublisherLoopOptions,
  ) {
    this.workerId = options.workerId ?? randomUUID();
    this.maxAttempts = options.maxAttempts ?? OUTBOX_DEFAULT_MAX_ATTEMPTS;
    this.batchSize = options.batchSize ?? OUTBOX_DEFAULT_BATCH_SIZE;
    this.leaseMs = options.leaseMs ?? OUTBOX_DEFAULT_LEASE_MS;
    this.publishTimeoutMs = options.publishTimeoutMs ?? 30_000;
    this.retryBaseMs = options.retryBaseMs ?? 5_000;
    this.retryMaxMs = options.retryMaxMs ?? 15 * 60_000;
    this.retryJitterRatio = options.retryJitterRatio ?? 0.2;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 30_000;
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.runTick = options.runTick ?? ((fn) => fn());
    this.logger = options.logger ?? {
      info: (message) => defaultLogger.info(message),
      warn: (message) => defaultLogger.warn(message),
      error: (message) => defaultLogger.error(message),
    };
  }

  /** Starts polling; resolves when the first tick finishes. Idempotent. */
  start(): Promise<void> {
    if (this.started) return this.activeTick ?? Promise.resolve();
    this.started = true;
    this.accepting = true;
    const initialTick = this.triggerTick();
    this.timer = setInterval(() => {
      void this.triggerTick();
    }, this.options.intervalMs);
    this.timer.unref();
    return initialTick;
  }

  stop(): Promise<OutboxStopResult> {
    this.stopPromise ??= this.stopInternal();
    return this.stopPromise;
  }

  /** Runs exactly one poll cycle (exposed for tests and manual draining). */
  tick(): Promise<void> {
    return this.runTick(async () => {
      const claimed = await this.outbox.claim({
        workerId: this.workerId,
        now: this.now(),
        maxAttempts: this.maxAttempts,
        leaseMs: this.leaseMs,
        batchSize: this.batchSize,
      });
      await Promise.all(claimed.map((message) => this.publishClaim(message)));
    });
  }

  private async stopInternal(): Promise<OutboxStopResult> {
    this.accepting = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const active = this.activeTick;
    if (!active) return { outcome: "drained" };
    let timeout: NodeJS.Timeout | undefined;
    const outcome = await Promise.race([
      active.then(() => "drained" as const),
      new Promise<"timed_out">((resolve) => {
        timeout = setTimeout(() => resolve("timed_out"), this.shutdownTimeoutMs);
      }),
    ]);
    clearTimeout(timeout);
    return { outcome };
  }

  private triggerTick(): Promise<void> {
    if (!this.accepting) return Promise.resolve();
    if (this.activeTick) return this.activeTick;
    const active: Promise<void> = this.tick()
      .catch((error: unknown) => {
        this.logger.error(`Outbox claim failed worker=${this.workerId} reason=${boundedFailureReason(error, false)}`);
      })
      .finally(() => {
        if (this.activeTick === active) this.activeTick = null;
      });
    this.activeTick = active;
    return active;
  }

  private async publishClaim(message: ClaimedOutboxMessage): Promise<void> {
    const signal = AbortSignal.timeout(this.publishTimeoutMs);
    try {
      await this.publisher.publish(message.eventType, message.payload, message.correlationId, message.id, {
        abortSignal: signal,
      });
      const completion = await this.outbox.completeClaim({
        id: message.id,
        workerId: this.workerId,
        publishedAt: this.now(),
      });
      if (completion.outcome === "stale") {
        this.logger.warn(`Outbox completion stale id=${message.id} worker=${this.workerId}`);
      }
    } catch (error) {
      const reason = boundedFailureReason(error, signal.aborted);
      const delayMs = calculateRetryDelayMs({
        attempt: message.attemptCount,
        baseMs: this.retryBaseMs,
        maxMs: this.retryMaxMs,
        jitterRatio: this.retryJitterRatio,
        random: this.random,
      });
      try {
        const failure = await this.outbox.failClaim({
          id: message.id,
          workerId: this.workerId,
          reason,
          retryAt: new Date(this.now().getTime() + delayMs),
          maxAttempts: this.maxAttempts,
        });
        if (failure.outcome === "stale") {
          this.logger.warn(`Outbox failure stale id=${message.id} worker=${this.workerId} reason=${reason}`);
        } else if (failure.outcome === "terminal_failed") {
          this.logger.error(`Outbox terminal failure id=${message.id} attempt=${message.attemptCount} reason=${reason}`);
        } else {
          this.logger.warn(`Outbox retry scheduled id=${message.id} attempt=${message.attemptCount} reason=${reason}`);
        }
      } catch (failureError) {
        this.logger.error(
          `Outbox failure transition failed id=${message.id} worker=${this.workerId} reason=${boundedFailureReason(failureError, false)}`,
        );
      }
    }
  }
}

export interface CrmOutboxPublisher {
  /** Idempotent: stops the loop (bounded drain) and closes the Service Bus client. */
  close(): Promise<void>;
}

export interface OutboxPublisherWiring {
  settings?: ServiceBusSettings | null;
  createPublisher?: (settings: ServiceBusSettings) => MessagePublisher;
  repository?: OutboxRepository;
  intervalMs?: number;
  maxAttempts?: number;
}

/**
 * Starts the outbox publisher next to the other background workers
 * (`index.ts`, never `app.ts`). Returns `null` -- and the CRM keeps running --
 * when Service Bus is not configured or the client cannot be built; events then
 * simply accumulate in `outbox_messages` until a configured instance drains them.
 */
export function startCrmOutboxPublisher(wiring: OutboxPublisherWiring = {}): CrmOutboxPublisher | null {
  const settings = wiring.settings === undefined ? resolveServiceBusSettings() : wiring.settings;
  if (settings === null) {
    defaultLogger.info("Service Bus is not configured: CRM outbox publishing (CrmUserCreated) is disabled");
    return null;
  }

  try {
    const publisher = (wiring.createPublisher ?? ((s: ServiceBusSettings) => new ServiceBusMessagePublisher(s)))(settings);
    const loop = new OutboxPublisherLoop(wiring.repository ?? createPrismaOutboxRepository(), publisher, {
      intervalMs: wiring.intervalMs ?? env.OUTBOX_POLL_INTERVAL_MS,
      maxAttempts: wiring.maxAttempts ?? env.OUTBOX_MAX_ATTEMPTS,
      // The table is not tenant data, but the app runs under a fail-closed
      // tenant context; system jobs declare themselves explicitly.
      runTick: (fn) => runAsSystem(fn),
    });
    void loop.start();
    defaultLogger.info({ mode: settings.mode, topicName: settings.topicName }, "CRM outbox publisher started");

    let closePromise: Promise<void> | null = null;
    return {
      close() {
        closePromise ??= (async () => {
          try {
            await loop.stop();
          } finally {
            await publisher.close();
          }
        })().catch((error: unknown) => {
          defaultLogger.error(
            { message: error instanceof Error ? error.message : String(error) },
            "Failed to close the CRM outbox publisher",
          );
        });
        return closePromise;
      },
    };
  } catch (error) {
    defaultLogger.error(
      { message: error instanceof Error ? error.message : String(error) },
      "Could not start the CRM outbox publisher: CrmUserCreated publishing is disabled",
    );
    return null;
  }
}
