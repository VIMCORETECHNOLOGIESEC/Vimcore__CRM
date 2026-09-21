import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { CRM_USER_ACCESS_RESEND_REQUESTED_EVENT, enqueueOutboxEvent } from "./outbox.js";

/**
 * crm-user-access-resend (F2): `CrmUserAccessResendRequested` (CRM -> Auth)
 * payload, see the event contract in `odd/tasks/crm-user-access-resend.md`.
 */
export interface CrmUserAccessResendRequestedPayload {
  crmUserId: string;
  authUserId: string;
  authCompanyId: string;
  /** Normalized (trim + lowercase) current CRM login email. */
  email: string;
  correlationId: string;
  occurredAt: string;
}

export interface EnqueueCrmUserAccessResendInput {
  crmUserId: string;
  authUserId: string;
  authCompanyId: string;
  email: string;
  now?: Date;
}

/** Enqueues `CrmUserAccessResendRequested` in the CALLER's transaction. */
export async function enqueueCrmUserAccessResend(
  tx: Prisma.TransactionClient,
  input: EnqueueCrmUserAccessResendInput,
): Promise<void> {
  const correlationId = randomUUID();
  const payload: CrmUserAccessResendRequestedPayload = {
    crmUserId: input.crmUserId,
    authUserId: input.authUserId,
    authCompanyId: input.authCompanyId,
    email: input.email.trim().toLowerCase(),
    correlationId,
    occurredAt: (input.now ?? new Date()).toISOString(),
  };
  await enqueueOutboxEvent(tx, {
    eventType: CRM_USER_ACCESS_RESEND_REQUESTED_EVENT,
    aggregateId: input.crmUserId,
    correlationId,
    payload: { ...payload },
  });
}
