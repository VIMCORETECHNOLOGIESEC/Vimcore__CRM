import { randomBytes } from "node:crypto";
import type { Empresa, Prisma, Usuario } from "@prisma/client";
import { hashPassword } from "../lib/password.js";
import { AUTH_PROVISIONING_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import * as empresaRepository from "../repositories/empresa.repository.js";
import * as holdingRepository from "../repositories/holding.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";

export interface ProvisionCrmCompanyInput {
  companyId: string;
  legalName: string;
  adminUserId: string;
  adminEmail: string;
  adminFullName: string;
}

export type ProvisionCrmCompanyOutcome = "provisioned" | "noop";

export interface ProvisionCrmCompanyResult {
  outcome: ProvisionCrmCompanyOutcome;
  holdingId: string;
  empresaId: string;
  usuarioId: string;
}

/**
 * The announced admin cannot be provisioned without touching a CRM user that
 * auth did not vouch for (same email owned by another/unlinked `Usuario`) or
 * that does not fit the holding-admin shape. Never retried: redelivery would
 * hit the same conflict, so the consumer dead-letters it.
 */
export class AuthProvisioningConflictError extends Error {
  constructor(
    readonly reason: "admin_email_conflict" | "admin_user_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "AuthProvisioningConflictError";
  }
}

// A concurrent redelivery can win the insert race; the retry re-reads the rows it created.
const MAX_ATTEMPTS = 3;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * holding-admin-gateway-auth: provisions, from the auth `CompanyModuleSubscribed`
 * event, the CRM side of a newly registered company -- a `Holding` (named after
 * the company) owning the `Empresa` linked by `authCompanyId`, and its first admin
 * as an `ADMINISTRADOR_HOLDING` `Usuario` linked by `authUserId` (no `Membresia`:
 * holding scope needs none).
 *
 * One transaction; every step is find-or-create so a redelivery, or a state where
 * only part of the graph exists, converges to the complete state without
 * duplicates. `holdings`/`empresas`/`usuarios` have no RLS, so no `TenantContext`
 * is needed.
 *
 * SECURITY: a `Usuario` is only ever matched by `authUserId`. Auth does not verify
 * email ownership, so an existing `Usuario` with the same `correo` (Citext, case
 * insensitive) but another/no `authUserId` is a conflict, never linked or merged
 * (that would let anyone registering in auth with a victim's email take over the
 * victim's CRM account). The transaction rolls back, so nothing is created.
 */
export async function provisionCrmCompanyAdmin(
  input: ProvisionCrmCompanyInput,
): Promise<ProvisionCrmCompanyResult> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await runInTransaction(undefined, (tx) => provisionOnce(input, tx), AUTH_PROVISIONING_TRANSACTION_BOUNDS);
    } catch (error) {
      if (isUniqueViolation(error) && attempt < MAX_ATTEMPTS) continue;
      throw error;
    }
  }
}

async function provisionOnce(
  input: ProvisionCrmCompanyInput,
  tx: Prisma.TransactionClient,
): Promise<ProvisionCrmCompanyResult> {
  const correo = input.adminEmail.trim();
  let changed = false;

  let usuario: Usuario | null = await usuarioRepository.findByAuthUserId(input.adminUserId, tx);
  let empresa: Empresa | null = await empresaRepository.findByAuthCompanyId(input.companyId, tx);

  if (usuario === null) {
    const sameEmail = await usuarioRepository.findByEmail(correo, tx);
    if (sameEmail !== null) {
      throw new AuthProvisioningConflictError(
        "admin_email_conflict",
        "A CRM user with the announced admin email already exists and is not linked to the announced auth user",
      );
    }
  } else if (usuario.rol !== "ADMINISTRADOR_HOLDING") {
    throw new AuthProvisioningConflictError(
      "admin_user_mismatch",
      "The CRM user linked to the announced auth user is not a holding administrator",
    );
  }

  // The holding: the empresa's, else the admin's, else a new one named after the company.
  let holdingId = empresa?.holdingId ?? usuario?.holdingId ?? null;
  if (holdingId === null) {
    holdingId = (await holdingRepository.create({ nombre: input.legalName }, tx)).id;
    changed = true;
  } else if (usuario?.holdingId && usuario.holdingId !== holdingId) {
    throw new AuthProvisioningConflictError(
      "admin_user_mismatch",
      "The CRM admin and the CRM empresa of the announced company belong to different holdings",
    );
  }

  if (empresa === null) {
    empresa = await empresaRepository.createLinked(
      { nombre: input.legalName, authCompanyId: input.companyId, holdingId },
      tx,
    );
    changed = true;
  } else if (empresa.holdingId === null) {
    empresa = await empresaRepository.setHolding(empresa.id, holdingId, tx);
    changed = true;
  }

  if (usuario === null) {
    usuario = await usuarioRepository.createLinked(
      {
        nombre: input.adminFullName,
        correo,
        // Random unusable hash, same as the carrier users of `createEmpresaAdministrador`:
        // login goes through the platform auth, never through this password.
        passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
        rol: "ADMINISTRADOR_HOLDING",
        authUserId: input.adminUserId,
        holdingId,
      },
      tx,
    );
    changed = true;
  } else if (usuario.holdingId === null) {
    usuario = await usuarioRepository.setHolding(usuario.id, holdingId, tx);
    changed = true;
  }

  return {
    outcome: changed ? "provisioned" : "noop",
    holdingId,
    empresaId: empresa.id,
    usuarioId: usuario.id,
  };
}
