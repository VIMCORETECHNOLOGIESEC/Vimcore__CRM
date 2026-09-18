import { timingSafeEqual } from "node:crypto";
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
 * crm-gateway-proxy (CRM Gateway Trust, design.md, ADR #8 "Server-to-server
 * trust, not JWT propagation"): primer paso de la migración de CRM hacia una
 * identidad resuelta por Auth/Gateway. El Gateway (Api_gateway_Vimcore) ya
 * validó el JWT real de Auth y reenvía, servicio a servicio, la identidad
 * resuelta -- mismo patrón ya vivo para `api_vimpey` -- vía tres encabezados:
 * `X-Gateway-Secret` (secreto compartido, INV-4), `X-Gateway-Company-Id` y
 * `X-Gateway-User-Id` (ids de AUTH, nunca ids propios de CRM, INV-1). Este
 * middleware NUNCA valida un JWT de Auth directamente -- esa opción fue
 * evaluada y rechazada explícitamente (reabriría la decisión de seguridad ya
 * cerrada sobre HS256 sin JWKS).
 *
 * `authCompanyId`/`authUserId` (migración `20260916203815_auth_identity_link`)
 * son la única traducción entre los ids de Auth y los ids propios de CRM
 * (`Empresa`/`Usuario`) -- exactamente el mismo criterio de traducción que
 * `require-bridge-key.middleware.ts` aplica para `claveApiHash` -> `Bridge`.
 * CRM sigue siendo la única autoridad de autorización (`Usuario.rol`,
 * `Membresia.rol`): este middleware SOLO establece identidad confiable +
 * contexto de tenant, igual que `require-authentication.middleware.ts`, pero
 * entrando por encabezados en vez de por JWT.
 *
 * Desviación deliberada frente a `requireAuthentication`: esa función resuelve
 * `sessionScope` ("company" | "holding") desde un claim de sesión propio de
 * CRM (`dual-login-routing`), inexistente acá -- el modelo de sesión de Auth
 * hoy es single-company, así que el Gateway SIEMPRE reenvía una
 * `authCompanyId` puntual, nunca "todas las empresas". No hay encabezado que
 * pueda pedir alcance holding-wide (el diseño lo prohíbe explícitamente: "no
 * inventar semántica de scope nueva que los encabezados no llevan"), así que
 * `sessionScope` es SIEMPRE `"company"` y `empresaId` SIEMPRE la `Empresa`
 * resuelta -- nunca `null`. `membresiaCoincide` (requireAuthentication)
 * compara la `Membresia` recargada contra los claims de un JWT ya emitido;
 * acá no hay claims previos que puedan quedar desincronizados -- cada request
 * relee `Usuario`/`Empresa`/`Membresia` desde cero, así que ese chequeo de
 * consistencia no aplica.
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
  // la variable sin setear cierra el camino confiable sin ningún deploy,
  // mientras `requireAuthentication` sigue sirviendo el resto de la API sin
  // interrupción.
  if (!secret || !presented || !compareGatewaySecret(secret, presented)) {
    next(gatewayNoAutorizado());
    return;
  }

  const authCompanyId = req.header("X-Gateway-Company-Id")?.trim();
  const authUserId = req.header("X-Gateway-User-Id")?.trim();

  if (!authCompanyId || !authUserId) {
    next(identidadNoVinculada());
    return;
  }

  // `empresas`/`usuarios` NO tienen RLS (mismo comentario que
  // `empresa.repository.ts::findByAuthCompanyId`/`usuario.repository.ts::
  // findByAuthUserId`) -- ambas lecturas corren ANTES de que exista cualquier
  // TenantContext, sin necesidad de GUC bootstrap.
  const [empresa, usuario] = await Promise.all([
    empresaRepository.findByAuthCompanyId(authCompanyId),
    usuarioRepository.findByAuthUserId(authUserId),
  ]);

  // INV-1 (design.md, "identity resolution fails closed"): un solo código de
  // rechazo para TODA falla de resolución de identidad (empresa no linkeada,
  // usuario no linkeado, usuario inactivo, sin membresía) -- deliberado, para
  // no filtrarle al Gateway CUÁL de los cuatro casos fue (mismo criterio
  // deny-not-leak que ya aplica esta suite a nivel de fila, INV-2).
  if (!empresa || !usuario || !usuario.activo) {
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
