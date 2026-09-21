import { AUTH_PROVISIONING_TRANSACTION_BOUNDS, runAsSystem, runInTransaction } from "../lib/prisma.js";
import * as empresaRepository from "../repositories/empresa.repository.js";
import * as membresiaRepository from "../repositories/membresia.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";

export interface LinkAuthUserInput {
  crmUserId: string;
  authUserId: string;
  authCompanyId: string;
}

/**
 * Every outcome completes the message: none of them improves on redelivery, so
 * the consumer only logs them (the non-`linked` ones are anomalies worth a look).
 */
export type LinkAuthUserOutcome =
  | "linked"
  | "already_linked"
  | "user_not_found"
  | "different_auth_user"
  | "auth_user_in_use"
  | "company_mismatch";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * crm-user-auth-provisioning: links a CRM `Usuario` to the Auth user announced
 * by `AuthUserProvisioned` (outcome `created`). The match is ONLY by
 * `crmUserId` (= `Usuario.id`), never by email (Auth does not verify email
 * ownership). A link is never overwritten and never moved: an already linked
 * user, or an `authUserId` owned by another `Usuario`, is left untouched. The
 * user's empresa (through its memberships) must carry the event's
 * `authCompanyId`, otherwise nothing is linked.
 *
 * `usuarios`/`empresas` have no RLS but `membresias` does, and there is no
 * request context in a consumer: the lookup runs as system, inside one
 * transaction.
 */
export async function linkAuthUser(input: LinkAuthUserInput): Promise<LinkAuthUserOutcome> {
  try {
    return await linkOnce(input);
  } catch (error) {
    // A unique violation aborts the transaction: it is reported outside of it.
    if (isUniqueViolation(error)) return "auth_user_in_use";
    throw error;
  }
}

function linkOnce(input: LinkAuthUserInput): Promise<LinkAuthUserOutcome> {
  return runAsSystem(() =>
    runInTransaction(
      undefined,
      async (tx) => {
        const usuario = await usuarioRepository.findById(input.crmUserId, tx);
        if (usuario === null) return "user_not_found";

        if (usuario.authUserId === input.authUserId) return "already_linked";
        if (usuario.authUserId !== null) return "different_auth_user";

        const owner = await usuarioRepository.findByAuthUserId(input.authUserId, tx);
        if (owner !== null && owner.id !== usuario.id) return "auth_user_in_use";

        const membresias = await membresiaRepository.findActivasByUsuarioId(usuario.id, tx);
        const empresas = await Promise.all(membresias.map((m) => empresaRepository.findById(m.empresaId, tx)));
        if (!empresas.some((empresa) => empresa?.authCompanyId === input.authCompanyId)) {
          return "company_mismatch";
        }

        const linked = await usuarioRepository.linkAuthUserIfUnlinked(usuario.id, input.authUserId, tx);
        if (linked) return "linked";
        // Lost a race with another link: re-read to report what actually holds.
        const current = await usuarioRepository.findById(usuario.id, tx);
        return current?.authUserId === input.authUserId ? "already_linked" : "different_auth_user";
      },
      AUTH_PROVISIONING_TRANSACTION_BOUNDS,
    ),
  );
}
