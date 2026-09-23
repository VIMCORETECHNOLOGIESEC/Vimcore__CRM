import amqp, { type AmqpConnectionManager, type ChannelWrapper } from "amqp-connection-manager";
import type { ConfirmChannel, ConsumeMessage } from "amqplib";
import { env } from "../config/env.js";
import { describeError } from "../lib/error-details.js";
import { logger } from "../lib/logger.js";
import { createCompanyEventHandler, type CrmCompanyEventHandlerDeps } from "./crm-company-event-handler.js";
import { DOMAIN_EVENTS_EXCHANGE_TYPE } from "./rabbitmq-message-publisher.js";
import {
  computeRetryDelayMs,
  confirmSendToQueue,
  DEAD_ATTEMPTS_HEADER,
  DEAD_AT_HEADER,
  DEAD_DESCRIPTION_HEADER,
  DEAD_REASON_HEADER,
  DEAD_SOURCE_QUEUE_HEADER,
  readRetryAttempt,
  RETRY_ATTEMPT_HEADER,
  truncateDeadDescription,
} from "./rabbitmq-retry.js";

export interface RabbitMqConsumerSettings {
  url: string;
  exchangeName: string;
  queueName: string;
  /**
   * Optional so existing call sites/tests that only care about exchange/queue
   * wiring don't need to pass retry config; `resolveRabbitMqSettings` always
   * fills these from `env` (which has its own sane defaults).
   */
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  /**
   * crm-company-event-poison-loop (T3): durable parking queue. Optional --
   * when omitted, the consumer derives `${queueName}.dead` itself, same
   * fallback `resolveRabbitMqSettings` uses when the env var isn't set.
   */
  deadQueueName?: string;
}

type RabbitMqEnv = Pick<
  typeof env,
  | "RABBITMQ_URL"
  | "RABBITMQ_EXCHANGE_NAME"
  | "RABBITMQ_CRM_QUEUE_NAME"
  | "RABBITMQ_MAX_ATTEMPTS"
  | "RABBITMQ_RETRY_BASE_DELAY_MS"
  | "RABBITMQ_CRM_DEAD_QUEUE_NAME"
>;

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_DELAY_MS = 2_000;

/**
 * Settings the consumer needs, or `null` when `RABBITMQ_URL` is not present, in
 * which case provisioning is simply disabled and the CRM boots normally (same
 * optional-feature criterion Service Bus had).
 */
export function resolveRabbitMqSettings(source: RabbitMqEnv = env): RabbitMqConsumerSettings | null {
  if (!source.RABBITMQ_URL) return null;
  return {
    url: source.RABBITMQ_URL,
    exchangeName: source.RABBITMQ_EXCHANGE_NAME,
    queueName: source.RABBITMQ_CRM_QUEUE_NAME,
    maxAttempts: source.RABBITMQ_MAX_ATTEMPTS,
    retryBaseDelayMs: source.RABBITMQ_RETRY_BASE_DELAY_MS,
    deadQueueName: source.RABBITMQ_CRM_DEAD_QUEUE_NAME,
  };
}

function readEventTypeHeader(message: ConsumeMessage): string | undefined {
  const raw = message.properties.headers?.eventType;
  return typeof raw === "string" ? raw : undefined;
}

/**
 * holding-admin-gateway-auth / T4 (servicebus-to-rabbitmq-migration): consumes
 * the CRM's durable queue bound to the shared `vimcore-domain-events` fanout
 * exchange (both asserted and bound here on startup) and auto-provisions
 * Holding + Empresa + admin from the auth `CompanyModuleSubscribed` event (see
 * `auth-provisioning.service`). Manual ack; every settlement decision still
 * flows through `crm-company-event-handler.ts`'s {complete, deadLetter,
 * abandon} contract -- deadLetter maps to a non-requeued reject (no
 * dead-letter exchange is configured, so a `deadLetter`/exhausted-retry
 * decision now publishes a persistent, publisher-confirmed copy to a
 * `${queueName}.dead` parking queue -- asserted here alongside the main
 * queue -- instead of the broker silently dropping it (crm-company-event-
 * poison-loop T3: `nack(requeue=false)` on a queue with no DLX just drops the
 * message). abandon (and a thrown processing error) no longer maps to an
 * immediate requeued reject either -- that looped forever on a permanently
 * failing message (T2) -- and instead goes through `handleFailure`'s bounded
 * retry with backoff, parking once `maxAttempts` is exhausted. An idempotent
 * `close()`, same as before.
 */
export class CrmCompanyEventConsumer {
  private readonly connectionManager: AmqpConnectionManager;
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly deadQueueName: string;
  // crm-company-event-poison-loop (T2/T3): in-flight retry/requeue timers,
  // cleared on close() so a shutdown never fires a republish against a closed
  // channel.
  private readonly pendingRetries = new Set<NodeJS.Timeout>();
  private channelWrapper: ChannelWrapper | null = null;
  private closed = false;

  constructor(
    private readonly settings: RabbitMqConsumerSettings,
    // Test seam: lets tests trigger the handler's real "abandon" decision
    // (a permanently/transiently failing dependency) without a database, by
    // injecting fake provision/link/revert deps -- same shape
    // `createCompanyEventHandler` already accepts. `undefined` in production
    // falls through to its real defaults.
    private readonly handlerDeps?: CrmCompanyEventHandlerDeps,
  ) {
    this.maxAttempts = settings.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryBaseDelayMs = settings.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    this.deadQueueName = settings.deadQueueName ?? `${settings.queueName}.dead`;
    this.connectionManager = amqp.connect([settings.url]);
    this.connectionManager.on("connectFailed", ({ err }: { err: Error }) => {
      logger.error(
        { holdingWide: true, ...describeError(err) },
        "CRM company event consumer failed to connect to RabbitMQ",
      );
    });
  }

  start(): void {
    this.channelWrapper = this.connectionManager.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(this.settings.exchangeName, DOMAIN_EVENTS_EXCHANGE_TYPE, { durable: true });
        // Redeclaring the existing production queue with different arguments
        // (e.g. a DLX) would hit PRECONDITION_FAILED -- see the class doc
        // comment. The parking queue is a separate, independent durable queue
        // instead, asserted but never bound to the exchange (it only ever
        // receives direct `sendToQueue` copies, never fanout traffic).
        await channel.assertQueue(this.settings.queueName, { durable: true });
        await channel.assertQueue(this.deadQueueName, { durable: true });
        await channel.bindQueue(this.settings.queueName, this.settings.exchangeName, "");
        await channel.consume(this.settings.queueName, (message) => {
          if (message) void this.processMessage(channel, message);
        });
      },
    });
  }

  private async processMessage(channel: ConfirmChannel, message: ConsumeMessage): Promise<void> {
    const handle = createCompanyEventHandler(
      {
        completeMessage: async () => {
          channel.ack(message);
        },
        // crm-company-event-poison-loop (T3): a handler-decided deadLetter
        // (malformed/invalid payload, provisioning conflict, ...) is just as
        // final as an exhausted retry -- park it instead of dropping it.
        deadLetterMessage: async (_msg, options) => {
          await this.parkMessage(channel, message, {
            reason: options.deadLetterReason,
            description: options.deadLetterErrorDescription,
          });
        },
        // The handler already logged the specific business cause (with its own
        // holdingWide + explicit error) before deciding to abandon -- see
        // crm-company-event-handler.ts. Here we only own the bounded
        // retry/dead-letter bookkeeping, same as a thrown error below.
        abandonMessage: async () => {
          await this.handleFailure(
            channel,
            message,
            new Error("CRM company event handler requested a retry (abandon): see the handler's own error log for the cause"),
          );
        },
      },
      this.handlerDeps,
    );

    try {
      await handle({
        messageId: message.properties.messageId,
        correlationId: message.properties.correlationId,
        applicationProperties: message.properties.headers as Record<string, unknown> | undefined,
        // Always a raw Buffer over RabbitMQ (no SDK pre-decoding ambiguity like
        // Service Bus had) -- crm-company-event-handler.ts's decodeBody() JSON.parses it explicitly.
        body: message.content,
      });
    } catch (error) {
      await this.handleFailure(channel, message, error);
    }
  }

  /**
   * crm-company-event-poison-loop (T2/T3): the single bounded-retry/parking
   * decision point for both failure surfaces (a thrown error and a handler
   * abandon). Below `maxAttempts`, schedules a delayed republish carrying an
   * incremented `x-crm-attempt` header (classic queues have no native
   * delivery-count header, so this is tracked explicitly) and only then acks
   * the original, per the task's stated ordering -- the original stays as a
   * safety net in case the process dies mid-delay. At `maxAttempts`, the
   * message is parked in `deadQueueName` instead of looping forever or being
   * dropped.
   */
  private async handleFailure(channel: ConfirmChannel, message: ConsumeMessage, cause: unknown): Promise<void> {
    const attempt = readRetryAttempt(message.properties.headers) + 1;

    if (attempt >= this.maxAttempts) {
      const description = cause instanceof Error ? cause.message : String(cause);
      await this.parkMessage(channel, message, { reason: "RetryAttemptsExhausted", description }, cause);
      return;
    }

    logger.warn(
      {
        holdingWide: true,
        ...describeError(cause),
        messageId: message.properties.messageId,
        correlationId: message.properties.correlationId,
        eventType: readEventTypeHeader(message),
        attempt,
        maxAttempts: this.maxAttempts,
      },
      "CRM company event processing failed: scheduling a bounded retry",
    );
    this.scheduleRetry(channel, message, attempt);
  }

  private scheduleRetry(channel: ConfirmChannel, message: ConsumeMessage, attempt: number): void {
    const delayMs = computeRetryDelayMs(this.retryBaseDelayMs, attempt);
    const timer = setTimeout(() => {
      this.pendingRetries.delete(timer);
      void this.republishRetry(channel, message, attempt);
    }, delayMs);
    this.pendingRetries.add(timer);
  }

  /**
   * crm-company-event-poison-loop (T3): awaits the broker's publisher confirm
   * for the republished retry copy before acking the original -- if the
   * broker never confirms (connection drop, channel error, ...), the original
   * is neither dropped nor acked: it is nacked with `requeue=true` (after a
   * short delay, so a broker outage doesn't turn into a synchronous hot loop
   * either) so the broker itself keeps it and redelivers.
   */
  private async republishRetry(channel: ConfirmChannel, message: ConsumeMessage, attempt: number): Promise<void> {
    try {
      await confirmSendToQueue(channel, this.settings.queueName, message.content, {
        persistent: true,
        messageId: message.properties.messageId,
        correlationId: message.properties.correlationId,
        contentType: message.properties.contentType,
        headers: { ...message.properties.headers, [RETRY_ATTEMPT_HEADER]: attempt },
      });
    } catch (error) {
      logger.error(
        {
          holdingWide: true,
          ...describeError(error),
          messageId: message.properties.messageId,
          correlationId: message.properties.correlationId,
          attempt,
          queueName: this.settings.queueName,
        },
        "CRM company event retry republish was not confirmed by the broker: requeuing the original instead of losing it",
      );
      this.requeueWithDelay(channel, message);
      return;
    }
    channel.ack(message);
  }

  /**
   * crm-company-event-poison-loop (T3): publishes a persistent, publisher-
   * confirmed copy to the parking queue, with explicit `x-crm-dead-*` headers
   * recording why/when/how-many-attempts, then acks the original only once
   * that publish is confirmed. If the broker never confirms the parking
   * publish, the original is never acked and never dropped -- it is nacked
   * with `requeue=true` after a short delay instead, and the failure is
   * logged explicitly.
   */
  private async parkMessage(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    info: { reason: string; description: string },
    cause?: unknown,
  ): Promise<void> {
    const attempts = readRetryAttempt(message.properties.headers) + 1;
    const headers = {
      ...message.properties.headers,
      [DEAD_REASON_HEADER]: info.reason,
      [DEAD_DESCRIPTION_HEADER]: truncateDeadDescription(info.description),
      [DEAD_ATTEMPTS_HEADER]: attempts,
      [DEAD_AT_HEADER]: new Date().toISOString(),
      [DEAD_SOURCE_QUEUE_HEADER]: this.settings.queueName,
    };
    const logContext = {
      holdingWide: true,
      messageId: message.properties.messageId,
      correlationId: message.properties.correlationId,
      eventType: readEventTypeHeader(message),
      reason: info.reason,
      description: info.description,
      attempts,
      deadQueueName: this.deadQueueName,
    };

    try {
      await confirmSendToQueue(channel, this.deadQueueName, message.content, {
        persistent: true,
        messageId: message.properties.messageId,
        correlationId: message.properties.correlationId,
        contentType: message.properties.contentType,
        headers,
      });
    } catch (error) {
      logger.error(
        { ...logContext, ...describeError(error) },
        `CRM company event: publishing to the parking queue "${this.deadQueueName}" was not confirmed by the broker: requeuing the original instead of losing it`,
      );
      this.requeueWithDelay(channel, message);
      return;
    }

    logger.error(
      { ...logContext, ...(cause !== undefined ? describeError(cause) : {}) },
      `CRM company event parked in "${this.deadQueueName}" after ${attempts} attempt(s): ${info.reason}`,
    );
    channel.ack(message);
  }

  /**
   * crm-company-event-poison-loop (T3): the "never drop" fallback shared by
   * `republishRetry` and `parkMessage` when the broker never confirms their
   * publish. A short delay (instead of an immediate nack/redelivery) keeps a
   * broker outage from becoming a synchronous hot loop against the same
   * connection.
   */
  private requeueWithDelay(channel: ConfirmChannel, message: ConsumeMessage): void {
    const timer = setTimeout(() => {
      this.pendingRetries.delete(timer);
      channel.nack(message, false, true);
    }, this.retryBaseDelayMs);
    this.pendingRetries.add(timer);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const timer of this.pendingRetries) clearTimeout(timer);
    this.pendingRetries.clear();
    try {
      if (this.channelWrapper) await this.channelWrapper.close();
      await this.connectionManager.close();
    } catch (error) {
      logger.error(
        { holdingWide: true, ...describeError(error) },
        "Failed to close the CRM company event consumer",
      );
    }
  }
}

/**
 * Starts the consumer next to the other background workers (`index.ts`, never
 * `app.ts`). Returns `null` -- and the CRM keeps running -- when RabbitMQ is
 * not configured or the client cannot be built.
 */
export function startCrmCompanyEventConsumer(
  settings: RabbitMqConsumerSettings | null = resolveRabbitMqSettings(),
): CrmCompanyEventConsumer | null {
  if (settings === null) {
    logger.info(
      { holdingWide: true },
      "RabbitMQ is not configured: CRM auto-provisioning from auth events is disabled",
    );
    return null;
  }

  try {
    const consumer = new CrmCompanyEventConsumer(settings);
    consumer.start();
    logger.info(
      { holdingWide: true, exchangeName: settings.exchangeName, queueName: settings.queueName },
      "CRM company event consumer started",
    );
    return consumer;
  } catch (error) {
    logger.error(
      { holdingWide: true, ...describeError(error) },
      "Could not start the CRM company event consumer: auto-provisioning is disabled",
    );
    return null;
  }
}
