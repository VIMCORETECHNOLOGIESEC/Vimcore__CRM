import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { CRM_USER_EMAIL_CHANGED_EVENT, enqueueOutboxEvent } from "./outbox.js";

/**
 * crm-user-email-sync (E1): `CrmUserEmailChanged` (CRM -> Auth) payload, see
 * the event contract in `odd/tasks/crm-user-email-sync.md`.
 */
export interface CrmUserEmailChangedPayload {
  crmUserId: string;
  authUserId: string;
  authCompanyId: string;
  /** Normalized (trim + lowercase) login email before the change. */
  oldEmail: string;
  /** Normalized (trim + lowercase) login email after the change. */
  newEmail: string;
  correlationId: string;
  occurredAt: string;
}

export interface EnqueueCrmUserEmailChangedInput {
  crmUserId: string;
  authUserId: string;
  authCompanyId: string;
  oldEmail: string;
  newEmail: string;
  now?: Date;
}

/** Enqueues `CrmUserEmailChanged` in the CALLER's transaction. */
export async function enqueueCrmUserEmailChanged(
  tx: Prisma.TransactionClient,
  input: EnqueueCrmUserEmailChangedInput,
): Promise<void> {
  const correlationId = randomUUID();
  const payload: CrmUserEmailChangedPayload = {
    crmUserId: input.crmUserId,
    authUserId: input.authUserId,
    authCompanyId: input.authCompanyId,
    oldEmail: input.oldEmail.trim().toLowerCase(),
    newEmail: input.newEmail.trim().toLowerCase(),
    correlationId,
    occurredAt: (input.now ?? new Date()).toISOString(),
  };
  await enqueueOutboxEvent(tx, {
    eventType: CRM_USER_EMAIL_CHANGED_EVENT,
    aggregateId: input.crmUserId,
    correlationId,
    payload: { ...payload },
  });
}
