import type { ConfirmChannel, Options } from "amqplib";

/**
 * crm-company-event-poison-loop (T2): shared retry-attempt bookkeeping for the
 * CRM company-event consumer (`crm-company-event-consumer.ts`) and its handler
 * (`crm-company-event-handler.ts`). A classic (non-quorum) RabbitMQ queue has
 * no native delivery-count header, so the consumer stamps this header itself
 * on every republished retry copy -- carrying an explicit attempt count end to
 * end, all the way into the handler's own log lines.
 */
export const RETRY_ATTEMPT_HEADER = "x-crm-attempt";

const MAX_RETRY_DELAY_MS = 30_000;

/**
 * Exponential backoff from `baseDelayMs`, capped at `MAX_RETRY_DELAY_MS` so a
 * large `RABBITMQ_MAX_ATTEMPTS` can't stall a message for minutes. `attempt`
 * is the 1-based number of the attempt that just failed.
 */
export function computeRetryDelayMs(baseDelayMs: number, attempt: number): number {
  return Math.min(baseDelayMs * 2 ** Math.max(attempt - 1, 0), MAX_RETRY_DELAY_MS);
}

/** Reads the number of attempts already made from a message's headers (0 when absent/invalid). */
export function readRetryAttempt(headers: Record<string, unknown> | undefined): number {
  const raw = headers?.[RETRY_ATTEMPT_HEADER];
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

/**
 * crm-company-event-poison-loop (T3): headers stamped on the persistent copy
 * published to the parking (`.dead`) queue -- distinct from `RETRY_ATTEMPT_HEADER`,
 * which tracks the LIVE in-flight retry count on a still-circulating message.
 * These are the final record of why/when/how-many-attempts a message was
 * parked, for an operator inspecting the parking queue.
 */
export const DEAD_REASON_HEADER = "x-crm-dead-reason";
export const DEAD_DESCRIPTION_HEADER = "x-crm-dead-description";
export const DEAD_ATTEMPTS_HEADER = "x-crm-attempts";
export const DEAD_AT_HEADER = "x-crm-dead-at";
export const DEAD_SOURCE_QUEUE_HEADER = "x-crm-source-queue";

const MAX_DEAD_DESCRIPTION_LENGTH = 500;

/** Keeps the parked description bounded and free of accidental secret-length payloads. */
export function truncateDeadDescription(description: string): string {
  return description.length > MAX_DEAD_DESCRIPTION_LENGTH
    ? `${description.slice(0, MAX_DEAD_DESCRIPTION_LENGTH)}…`
    : description;
}

/**
 * crm-company-event-poison-loop (T3): a real publisher-confirm wait, not a
 * fire-and-forget `sendToQueue`. `ConfirmChannel.sendToQueue`'s callback fires
 * only once the broker has itself ack'd (resolve) or nack'd (reject) the
 * publish -- unlike the plain `Channel` API or a bare boolean return value,
 * this genuinely waits for the broker, so the caller can safely decide whether
 * it is now safe to ack the original message.
 */
export function confirmSendToQueue(
  channel: ConfirmChannel,
  queue: string,
  content: Buffer,
  options: Options.Publish,
): Promise<void> {
  return new Promise((resolve, reject) => {
    channel.sendToQueue(queue, content, options, (error) => {
      if (error) reject(error instanceof Error ? error : new Error(String(error)));
      else resolve();
    });
  });
}
