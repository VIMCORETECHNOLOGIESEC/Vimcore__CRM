import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * crm-user-auth-provisioning (C1): transactional outbox for integration events.
 * `enqueueOutboxEvent` writes through the CALLER's transaction client so the
 * event commits (or rolls back) atomically with the business change; the
 * publisher loop drains the table through `createPrismaOutboxRepository`.
 * `outbox_messages` is a system table (no RLS, no `empresa_id`).
 */

export const CRM_USER_CREATED_EVENT = "CrmUserCreated";
export const CRM_USER_EMAIL_CHANGED_EVENT = "CrmUserEmailChanged";
export const CRM_USER_ACCESS_RESEND_REQUESTED_EVENT = "CrmUserAccessResendRequested";
export const OUTBOX_DEFAULT_BATCH_SIZE = 10;
export const OUTBOX_DEFAULT_LEASE_MS = 60_000;
export const OUTBOX_DEFAULT_MAX_ATTEMPTS = 10;

export interface EnqueueOutboxEventInput {
  eventType: string;
  aggregateId: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

/** Inserts one `pending` outbox row inside the caller's transaction. */
export async function enqueueOutboxEvent(
  tx: Prisma.TransactionClient,
  input: EnqueueOutboxEventInput,
): Promise<{ id: string }> {
  const row = await tx.outboxMessage.create({
    data: {
      eventType: input.eventType,
      aggregateId: input.aggregateId,
      correlationId: input.correlationId,
      payload: input.payload as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return row;
}

/**
 * Finds the outbox row of an already enqueued event by its correlation id
 * (used by compensations to recover what the original event carried).
 */
export async function findOutboxEventByCorrelation(
  tx: Prisma.TransactionClient,
  input: { eventType: string; aggregateId: string; correlationId: string },
): Promise<{ id: string; payload: unknown } | null> {
  return tx.outboxMessage.findFirst({
    where: {
      eventType: input.eventType,
      aggregateId: input.aggregateId,
      correlationId: input.correlationId,
    },
    select: { id: true, payload: true },
  });
}

/**
 * Finds the most recent outbox row of `eventType` for `aggregateId` created at
 * or after `since` (used for per-user cooldowns without a dedicated table).
 */
export async function findRecentOutboxEvent(
  tx: Prisma.TransactionClient,
  eventType: string,
  aggregateId: string,
  since: Date,
): Promise<{ id: string; createdAt: Date } | null> {
  return tx.outboxMessage.findFirst({
    where: { eventType, aggregateId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });
}

export interface ClaimedOutboxMessage {
  id: string;
  eventType: string;
  correlationId: string;
  /** Serialized JSON body, ready to be sent as-is. */
  payload: string;
  /** Attempt number of THIS claim (already incremented, starts at 1). */
  attemptCount: number;
}

export interface OutboxClaimRequest {
  workerId: string;
  now: Date;
  maxAttempts: number;
  leaseMs: number;
  batchSize: number;
}

export interface OutboxFailureRequest {
  id: string;
  workerId: string;
  reason: string;
  retryAt: Date;
  maxAttempts: number;
}

export type OutboxFailureOutcome = "retry_scheduled" | "terminal_failed" | "stale";

/** Persistence port of the publisher loop (a fake is used in unit tests). */
export interface OutboxRepository {
  claim(request: OutboxClaimRequest): Promise<ClaimedOutboxMessage[]>;
  completeClaim(request: { id: string; workerId: string; publishedAt: Date }): Promise<{ outcome: "published" | "stale" }>;
  failClaim(request: OutboxFailureRequest): Promise<{ outcome: OutboxFailureOutcome }>;
}

interface ClaimedRow {
  id: string;
  event_type: string;
  correlation_id: string;
  payload: unknown;
  attempt_count: number;
}

/**
 * Lease-based claim (`FOR UPDATE SKIP LOCKED`, same approach as Api_Auth's
 * outbox): a row is `pending` and due, or `processing` with an expired lease
 * (worker crashed). Rows whose attempts are exhausted after a lease expiry are
 * moved to `failed` first so they are never re-claimed.
 */
export function createPrismaOutboxRepository(): OutboxRepository {
  return {
    async claim({ workerId, now, maxAttempts, leaseMs, batchSize }) {
      const leaseUntil = new Date(now.getTime() + leaseMs);
      return prisma.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "outbox_messages"
          SET "status" = 'failed',
              "last_error" = 'Maximum publish attempts reached after lease expiry',
              "locked_until" = NULL,
              "claimed_by" = NULL
          WHERE "status" = 'processing'
            AND "locked_until" <= ${now}
            AND "attempt_count" >= ${maxAttempts}
        `);
        const rows = await tx.$queryRaw<ClaimedRow[]>(Prisma.sql`
          WITH candidates AS (
            SELECT "id"
            FROM "outbox_messages"
            WHERE "attempt_count" < ${maxAttempts}
              AND (
                ("status" = 'pending' AND "next_attempt_at" <= ${now})
                OR ("status" = 'processing' AND "locked_until" <= ${now})
              )
            ORDER BY "next_attempt_at", "created_at", "id"
            FOR UPDATE SKIP LOCKED
            LIMIT ${batchSize}
          )
          UPDATE "outbox_messages" AS message
          SET "status" = 'processing',
              "attempt_count" = message."attempt_count" + 1,
              "locked_until" = ${leaseUntil},
              "claimed_by" = ${workerId}
          FROM candidates
          WHERE message."id" = candidates."id"
          RETURNING message."id", message."event_type", message."correlation_id",
                    message."payload", message."attempt_count"
        `);
        return rows.map((row) => ({
          id: row.id,
          eventType: row.event_type,
          correlationId: row.correlation_id,
          payload: JSON.stringify(row.payload),
          attemptCount: Number(row.attempt_count),
        }));
      });
    },

    async completeClaim({ id, workerId, publishedAt }) {
      const updated = await prisma.$executeRaw(Prisma.sql`
        UPDATE "outbox_messages"
        SET "status" = 'published',
            "published_at" = ${publishedAt},
            "last_error" = NULL,
            "locked_until" = NULL,
            "claimed_by" = NULL
        WHERE "id" = ${id}::uuid
          AND "status" = 'processing'
          AND "claimed_by" = ${workerId}
      `);
      return { outcome: updated === 1 ? "published" : "stale" };
    },

    async failClaim({ id, workerId, reason, retryAt, maxAttempts }) {
      const rows = await prisma.$queryRaw<{ status: "pending" | "failed" }[]>(Prisma.sql`
        UPDATE "outbox_messages"
        SET "status" = CASE
              WHEN "attempt_count" >= ${maxAttempts} THEN 'failed'::"outbox_message_status"
              ELSE 'pending'::"outbox_message_status"
            END,
            "next_attempt_at" = CASE WHEN "attempt_count" < ${maxAttempts} THEN ${retryAt} ELSE "next_attempt_at" END,
            "last_error" = ${reason},
            "locked_until" = NULL,
            "claimed_by" = NULL
        WHERE "id" = ${id}::uuid
          AND "status" = 'processing'
          AND "claimed_by" = ${workerId}
        RETURNING "status"
      `);
      const row = rows[0];
      if (!row) return { outcome: "stale" };
      return { outcome: row.status === "failed" ? "terminal_failed" : "retry_scheduled" };
    },
  };
}
