import { randomUUID } from "node:crypto";
import type { Prisma, RolUsuario } from "@prisma/client";
import { logger } from "../lib/logger.js";
import { CRM_USER_CREATED_EVENT, enqueueOutboxEvent } from "./outbox.js";

/**
 * crm-user-auth-provisioning (C1): `CrmUserCreated` (CRM -> Auth) payload, see
 * the event contract in `odd/tasks/crm-user-auth-provisioning.md`.
 */
export interface CrmUserCreatedPayload {
  crmUserId: string;
  /** Normalized REAL login email (never the synthetic carrier `Usuario.correo`). */
  email: string;
  fullName: string;
  authCompanyId: string;
  crmRole: RolUsuario;
  correlationId: string;
  occurredAt: string;
}

/** Holding-wide roles are out of v1: they do not belong to one Auth company. */
const HOLDING_WIDE_ROLES: ReadonlySet<RolUsuario> = new Set<RolUsuario>([
  "ADMINISTRADOR_HOLDING",
  "SUPERVISOR_HOLDING",
  "SUPER_ADMIN",
]);

export interface EnqueueCrmUserCreatedInput {
  crmUserId: string;
  /** Email the person logs in with (`Membresia.correo` or `Usuario.correo`, see callers). */
  loginEmail: string;
  fullName: string;
  crmRole: RolUsuario;
  /** The empresa the user was placed in; `null` for users without one. */
  empresa: { authCompanyId: string | null } | null;
  now?: Date;
}

/**
 * Enqueues `CrmUserCreated` in the CALLER's transaction. Returns `false` (and
 * writes nothing) when the user must not be provisioned in Auth: holding-wide
 * role, no empresa, or an empresa without `authCompanyId`. Never throws for
 * those cases, so user creation is unaffected.
 */
export async function enqueueCrmUserCreated(
  tx: Prisma.TransactionClient,
  input: EnqueueCrmUserCreatedInput,
): Promise<boolean> {
  if (HOLDING_WIDE_ROLES.has(input.crmRole) || input.empresa === null) return false;
  const authCompanyId = input.empresa.authCompanyId;
  if (!authCompanyId) {
    logger.info(
      { crmUserId: input.crmUserId, crmRole: input.crmRole },
      "CrmUserCreated not enqueued: the empresa has no authCompanyId",
    );
    return false;
  }

  const correlationId = randomUUID();
  const payload: CrmUserCreatedPayload = {
    crmUserId: input.crmUserId,
    email: input.loginEmail.trim().toLowerCase(),
    fullName: input.fullName,
    authCompanyId,
    crmRole: input.crmRole,
    correlationId,
    occurredAt: (input.now ?? new Date()).toISOString(),
  };
  await enqueueOutboxEvent(tx, {
    eventType: CRM_USER_CREATED_EVENT,
    aggregateId: input.crmUserId,
    correlationId,
    payload: { ...payload },
  });
  return true;
}
