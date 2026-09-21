import { timingSafeEqual } from "node:crypto";
import type { RolUsuario } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import { runWithTenantContext, withBootstrapUsuarioGuc } from "../lib/prisma.js";
import * as empresaRepository from "../repositories/empresa.repository.js";
import * as membresiaRepository from "../repositories/membresia.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";

function gatewayNoAutorizado(): AppError {
  return new AppError(
    "gateway_no_autorizado",
    401,
    "Falta el encabezado X-Gateway-Secret o no coincide con el secreto configurado",
  );
}

function identidadNoVinculada(): AppError {
  return new AppError(
    "identidad_no_vinculada",
    403,
    "La identidad reenviada por el Gateway no está vinculada a ningún Usuario/Empresa de CRM",
  );
}

/**
 * crm-gateway-proxy (CRM Gateway Trust, design.md): comparación en tiempo
 * constante entre el secreto configurado (`CRM_GATEWAY_SECRET`) y el
 * presentado en `X-Gateway-Secret`. A diferencia de `compareClaveBridge`
 * (`lib/clave-bridge.ts`, DD4) esto NO compara hashes sha256hex de igual
 * longitud fija -- compara los secretos en claro tal cual llegan, así que el
 * guard de longitud previo es imprescindible (`timingSafeEqual` lanza si los
 * buffers no miden lo mismo, y una longitud distinta ya sería una filtración
 * de temporización si no se cortara acá primero).
 */
function compareGatewaySecret(secret: string, presented: string): boolean {
  const bufferSecret = Buffer.from(secret);
  const bufferPresented = Buffer.from(presented);

  if (bufferSecret.length !== bufferPresented.length) {
    return false;
  }

  return timingSafeEqual(bufferSecret, bufferPresented);
}

/**
 * holding-admin-gateway-auth: roles whose scope is the holding
 * (`Usuario.holdingId`), never a single empresa. They need neither a
 * `Membresia` nor a company header, and resolve `empresaId: null`
 * (holding-wide through the application role, same as the JWT holding session
 * of `requireAuthentication`). Every other role stays company-scoped.
 */
export const HOLDING_SCOPED_ROLES: readonly RolUsuario[] = ["ADMINISTRADOR_HOLDING", "SUPERVISOR_HOLDING"];

/**
 * True when the request carries `X-Gateway-Secret` at all (even empty). Used by
 * `requireAuthentication` to pick the trust path: a request that presents the
 * header is NEVER allowed to fall back to the CRM JWT path.
 */
export function hasGatewaySecretHeader(req: Request): boolean {
  return req.headers["x-gateway-secret"] !== undefined;
}

/**
 * crm-gateway-proxy (CRM Gateway Trust, design.md, ADR #8 "Server-to-server
 * trust, not JWT propagation"): the Gateway (Api_gateway_Vimcore) already
 * validated the real Auth JWT and forwards the resolved identity, service to
 * service, through `X-Gateway-Secret` (shared secret, INV-4),
 * `X-Gateway-User-Id` (Auth user id) and, only when the session belongs to a
 * company, `X-Gateway-Company-Id` (Auth ids, never CRM ids, INV-1). This
 * middleware NEVER validates an Auth JWT directly.
 *
 * `authUserId`/`authCompanyId` (migration `20260916203815_auth_identity_link`)
 * are the only translation between Auth ids and CRM ids. The CRM DB stays the
 * single authority for role, scope, holding and empresas: the headers assert
 * identity only; everything else is re-read on every request.
 *
 * holding-admin-gateway-auth: the scope is resolved from the `Usuario`:
 * - `ADMINISTRADOR_HOLDING` / `SUPERVISOR_HOLDING` -> `sessionScope: "holding"`,
 *   `empresaId: null`, requires `Usuario.holdingId`; a company header, if sent,
 *   is ignored (it cannot narrow or widen a holding user).
 * - any other role -> `sessionScope: "company"`; the asserted company must
 *   resolve to an `Empresa` where the user has an active `Membresia`.
 * `membresiaCoincide` (requireAuthentication) compares the `Membresia` against
 * the claims of an already issued JWT; there are no prior claims here, so that
 * consistency check does not apply.
 */
export async function requireGatewayTrust(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const secret = env.CRM_GATEWAY_SECRET;
  const presented = req.header("X-Gateway-Secret")?.trim();

  // INV-4 (design.md): mismo guard que cubre a la vez encabezado ausente,
  // secreto presentado ausente y `CRM_GATEWAY_SECRET` sin configurar -- este
  // último es a propósito el kill switch de rollback (config/env.ts): dejar
  // la variable sin setear cierra el camino confiable sin ningún deploy.
  if (!secret || !presented || !compareGatewaySecret(secret, presented)) {
    next(gatewayNoAutorizado());
    return;
  }

  const authUserId = req.header("X-Gateway-User-Id")?.trim();

  if (!authUserId) {
    next(identidadNoVinculada());
    return;
  }

  // `empresas`/`usuarios` NO tienen RLS (mismo comentario que
  // `empresa.repository.ts::findByAuthCompanyId`/`usuario.repository.ts::
  // findByAuthUserId`) -- las lecturas corren ANTES de que exista cualquier
  // TenantContext, sin necesidad de GUC bootstrap.
  const usuario = await usuarioRepository.findByAuthUserId(authUserId);

  // INV-1 (design.md, "identity resolution fails closed"): un solo código de
  // rechazo para TODA falla de resolución de identidad (usuario no linkeado,
  // inactivo, holding sin `holdingId`, empresa no linkeada, sin membresía) --
  // deliberado, para no filtrarle al Gateway CUÁL de los casos fue.
  if (!usuario || !usuario.activo) {
    next(identidadNoVinculada());
    return;
  }

  if (HOLDING_SCOPED_ROLES.includes(usuario.rol)) {
    if (!usuario.holdingId) {
      next(identidadNoVinculada());
      return;
    }

    req.user = {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      sessionScope: "holding",
      empresaId: null,
      holdingId: usuario.holdingId,
    };
    // Holding-bound TenantContext: RLS exposes only the empresas of this
    // holding, never the unrestricted bypass (nor `crm_bypass_jobs`).
    runWithTenantContext({ holdingId: usuario.holdingId }, next);
    return;
  }

  const authCompanyId = req.header("X-Gateway-Company-Id")?.trim();
  const empresa = authCompanyId
    ? await empresaRepository.findByAuthCompanyId(authCompanyId)
    : null;

  if (!empresa) {
    next(identidadNoVinculada());
    return;
  }

  // D-F (mismo criterio que `require-authentication.middleware.ts`): jamás
  // confiar en los encabezados por sí solos para rol/estado -- `usuario` ya
  // viene recién releído de la BD arriba (`activo` verificado). La Membresia
  // SIEMPRE se busca dentro de `withBootstrapUsuarioGuc` (mismo seam de D2 gap
  // closure que `require-authentication.middleware.ts:86-88`): `membresias`
  // tiene RLS y todavía no existe ningún `TenantContext` en este punto -- es
  // justamente lo que esta lectura resuelve.
  const membresia = await withBootstrapUsuarioGuc(usuario.id, (tx) =>
    membresiaRepository.findActivaByUsuarioAndEmpresa(usuario.id, empresa.id, tx),
  );

  if (!membresia) {
    next(identidadNoVinculada());
    return;
  }

  // Mismo criterio que `require-authentication.middleware.ts` para el correo
  // de un portador: una `Membresia` con `correo` propio es la identidad real
  // (`Usuario.correo` puede ser el placeholder sintético `@no-login.crm.local`).
  req.user = {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: membresia.correo ?? usuario.correo,
    rol: usuario.rol,
    sessionScope: "company",
    membresiaId: membresia.id,
    empresaId: membresia.empresaId,
  };
  // Puebla el carrier de `AsyncLocalStorage` de `lib/prisma.ts` alrededor de
  // `next()` -- mismo criterio que `require-authentication.middleware.ts` y
  // `require-bridge-key.middleware.ts`: todo el resto del ciclo de vida de
  // esta request corre dentro de este TenantContext.
  runWithTenantContext({ empresaId: membresia.empresaId }, next);
}
