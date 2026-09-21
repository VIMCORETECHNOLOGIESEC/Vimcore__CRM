import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { AUTH_PROVISIONING_TRANSACTION_BOUNDS, runAsSystem, runInTransaction } from "../lib/prisma.js";
import { CRM_USER_EMAIL_CHANGED_EVENT, findOutboxEventByCorrelation } from "../messaging/outbox.js";
import * as empresaRepository from "../repositories/empresa.repository.js";
import * as membresiaRepository from "../repositories/membresia.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";

export interface RevertUserEmailInput {
  crmUserId: string;
  authUserId: string;
  authCompanyId: string;
  correlationId: string;
}

/**
 * Every outcome completes the message: none improves on redelivery. Only
 * `reverted` changed data; the rest are anomalies the consumer logs.
 */
export type RevertUserEmailOutcome =
  | "reverted"
  | "outbox_row_missing"
  | "outbox_payload_invalid"
  | "user_not_found"
  | "auth_user_mismatch"
  | "company_mismatch"
  | "not_syncable"
  | "email_changed_again"
  | "email_in_use";

const HOLDING_WIDE_ROLES: readonly string[] = ["ADMINISTRADOR_HOLDING", "SUPERVISOR_HOLDING", "SUPER_ADMIN"];

const originalPayloadSchema = z.object({ oldEmail: z.string().trim().min(1), newEmail: z.string().trim().min(1) });

const normalize = (email: string): string => email.trim().toLowerCase();

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * crm-user-email-sync (E3): compensation for `AuthUserEmailUpdated` with outcome
 * `conflict` / `failed`. The CRM applied the new login email immediately (user
 * decision), so it is put back to the ORIGINAL email recorded in the outbox row
 * of the original `CrmUserEmailChanged` (found by correlation id).
 *
 * Safety rules (any failure leaves the data untouched and reports why):
 * - the user's identity must match the event (`authUserId`, empresa
 *   `authCompanyId`);
 * - the login email is resolved per role exactly as the PATCH does (active
 *   membership `correo` for portador users, `Usuario.correo` otherwise) and
 *   must STILL equal the event's `newEmail`;
 * - the write is a compare-and-set inside one transaction;
 * - NEVER enqueues an event: Auth kept the old email, so there is nothing to sync.
 *
 * Runs as system (a consumer has no tenant context; `membresias` has RLS).
 */
export async function revertUserEmailChange(input: RevertUserEmailInput): Promise<RevertUserEmailOutcome> {
  try {
    return await revertOnce(input);
  } catch (error) {
    // A collision aborts the transaction: it is reported outside of it.
    if (isUniqueViolation(error)) return "email_in_use";
    if (error instanceof AppError && error.code === "correo_no_disponible") return "email_in_use";
    throw error;
  }
}

function revertOnce(input: RevertUserEmailInput): Promise<RevertUserEmailOutcome> {
  return runAsSystem(() =>
    runInTransaction(
      undefined,
      async (tx) => {
        const row = await findOutboxEventByCorrelation(tx, {
          eventType: CRM_USER_EMAIL_CHANGED_EVENT,
          aggregateId: input.crmUserId,
          correlationId: input.correlationId,
        });
        if (row === null) return "outbox_row_missing";
        const original = originalPayloadSchema.safeParse(row.payload);
        if (!original.success) return "outbox_payload_invalid";
        const { oldEmail, newEmail } = original.data;

        const usuario = await usuarioRepository.findById(input.crmUserId, tx);
        if (usuario === null) return "user_not_found";
        if (usuario.authUserId !== input.authUserId) return "auth_user_mismatch";
        if (HOLDING_WIDE_ROLES.includes(usuario.rol)) return "not_syncable";

        const membresias = await membresiaRepository.findActivasByUsuarioId(usuario.id, tx);
        const portadora = membresias.find((m) => m.correo !== null) ?? null;
        const membresiaEmpresa = portadora ?? membresias[0] ?? null;
        if (membresiaEmpresa === null) return "not_syncable";

        const empresa = await empresaRepository.findById(membresiaEmpresa.empresaId, tx);
        if (empresa?.authCompanyId !== input.authCompanyId) return "company_mismatch";

        const currentEmail = portadora?.correo ?? usuario.correo;
        if (normalize(currentEmail) !== normalize(newEmail)) return "email_changed_again";

        await membresiaRepository.assertCorreoDisponible(oldEmail, tx);
        const applied =
          portadora !== null
            ? await membresiaRepository.replaceCorreoIfEquals(portadora.id, currentEmail, oldEmail, tx)
            : await usuarioRepository.replaceCorreoIfEquals(usuario.id, currentEmail, oldEmail, tx);
        return applied ? "reverted" : "email_changed_again";
      },
      AUTH_PROVISIONING_TRANSACTION_BOUNDS,
    ),
  );
}
