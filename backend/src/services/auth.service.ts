import { createHash, randomUUID } from "node:crypto";
import type { Membresia, RolUsuario, Usuario } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt.js";
import { logger } from "../lib/logger.js";
import { verifyPassword } from "../lib/password.js";
import { withBootstrapCorreoGuc } from "../lib/prisma.js";
import * as membresiaRepository from "../repositories/membresia.repository.js";
import * as refreshTokenRepository from "../repositories/refresh-token.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  nombre: string;
  correo: string;
  rol: RolUsuario;
}

function invalidCredentials(): AppError {
  return new AppError(
    "credenciales_invalidas",
    401,
    "Correo o contraseña incorrectos",
  );
}

function invalidToken(): AppError {
  return new AppError("token_invalido", 401, "Token de refresco inválido");
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toPublicUser(user: Usuario): PublicUser {
  return {
    id: user.id,
    nombre: user.nombre,
    correo: user.correo,
    rol: user.rol,
  };
}

/**
 * Bloque B (dual-login-routing): `membresia` es `undefined` para toda sesión
 * holding-wide (`Usuario.correo`) — mismo comportamiento exacto que antes de
 * este cambio. Cuando se provee (camino `Membresia.correo`), su
 * `id`/`empresaId` viajan como claims additivos del access token y quedan
 * atados al `refresh_tokens.membresia_id` de esta sesión (spec, "session
 * carries that membership context").
 */
async function issueTokenPair(
  user: Usuario,
  membresia?: Pick<Membresia, "id" | "empresaId">,
): Promise<TokenPair> {
  const accessToken = await signAccessToken({
    id: user.id,
    rol: user.rol,
    membresiaId: membresia?.id,
    empresaId: membresia?.empresaId,
  });
  const jti = randomUUID();
  const refreshToken = await signRefreshToken({ id: user.id, jti });

  await refreshTokenRepository.create({
    jti,
    usuarioId: user.id,
    hash: hashRefreshToken(refreshToken.token),
    expiraEn: refreshToken.expiraEn,
    membresiaId: membresia?.id,
  });

  return { accessToken, refreshToken: refreshToken.token };
}

/**
 * D1, D2, D5: emite un par de tokens si el usuario está activo.
 *
 * Bloque B (dual-login-routing, spec "Login resolves both credential
 * types"): resuelve `Usuario.correo` PRIMERO — sin cambio de comportamiento
 * en ese camino. Solo ante un miss (ningún `Usuario` con ese correo) cae al
 * segundo camino, `Membresia.correo` (solo `activa=true`, filtrado por el
 * repositorio). Ambos caminos fallidos devuelven el MISMO error genérico —
 * sin oráculo de cuentas que revele por cuál tabla se intentó.
 */
export async function login(
  correo: string,
  password: string,
): Promise<TokenPair & { user: PublicUser }> {
  const user = await usuarioRepository.findByEmail(correo);
  if (user) {
    const isPasswordValid = await verifyPassword(user.passwordHash, password);
    if (!isPasswordValid) {
      throw invalidCredentials();
    }
    // Mismo código/mensaje que una contraseña incorrecta: sin oráculo de cuentas.
    if (!user.activo) {
      throw invalidCredentials();
    }

    const pair = await issueTokenPair(user);
    return { ...pair, user: toPublicUser(user) };
  }

  // Bloque C (Etapa 3, D2 gap closure, batch 3 discovery): ver
  // `lib/prisma.ts::withBootstrapCorreoGuc` — esta lectura ocurre ANTES de
  // que exista un TenantContext (login es el paso que lo origina).
  const membresia = await withBootstrapCorreoGuc(correo, (tx) =>
    membresiaRepository.findByEmail(correo, tx),
  );
  // `passwordHash` es NULL en toda Membresia backfillada (Fase 1) — nunca
  // puede autenticar; mismo mensaje genérico, sin revelar la causa exacta.
  if (!membresia || membresia.passwordHash === null) {
    throw invalidCredentials();
  }

  const isMembresiaPasswordValid = await verifyPassword(membresia.passwordHash, password);
  if (!isMembresiaPasswordValid) {
    throw invalidCredentials();
  }

  const usuarioDeMembresia = await usuarioRepository.findById(membresia.usuarioId);
  if (!usuarioDeMembresia || !usuarioDeMembresia.activo) {
    throw invalidCredentials();
  }

  const pair = await issueTokenPair(usuarioDeMembresia, membresia);
  return { ...pair, user: toPublicUser(usuarioDeMembresia) };
}

/**
 * Rotación en cada uso (D1). D-D: reutilizar un `jti` ya revocado revoca
 * toda la familia de refresh tokens del usuario.
 */
export async function refresh(token: string): Promise<TokenPair> {
  let payload: Awaited<ReturnType<typeof verifyRefreshToken>>;
  try {
    payload = await verifyRefreshToken(token);
  } catch {
    throw invalidToken();
  }

  const row = await refreshTokenRepository.findByJti(payload.jti);
  if (!row) {
    throw invalidToken();
  }

  if (row.revocadoEn !== null) {
    // D-D: reutilización detectada — revocar toda la cadena, nunca revelar
    // el motivo al cliente (mensaje genérico `token_invalido`).
    await refreshTokenRepository.revokeAllForUser(row.usuarioId);
    logger.warn(
      { usuarioId: row.usuarioId, jti: row.jti },
      "Reutilización de refresh token detectada; familia revocada",
    );
    throw invalidToken();
  }

  if (row.expiraEn.getTime() <= Date.now()) {
    throw invalidToken();
  }

  if (hashRefreshToken(token) !== row.hash) {
    throw invalidToken();
  }

  const user = await usuarioRepository.findById(row.usuarioId);
  if (!user || !user.activo) {
    throw invalidToken();
  }

  // Bloque B (dual-login-routing): `membresiaId` se transporta tal cual de
  // la fila anterior — la rotación nunca "pierde" el contexto de membresía
  // de la sesión original. `undefined` para toda sesión holding-wide previa
  // a este cambio (fila con `membresiaId` null), sin cambio de comportamiento.
  const accessToken = await signAccessToken({
    id: user.id,
    rol: user.rol,
    membresiaId: row.membresiaId ?? undefined,
  });
  const newJti = randomUUID();
  const newRefreshToken = await signRefreshToken({ id: user.id, jti: newJti });

  await refreshTokenRepository.rotate({
    previousJti: row.jti,
    newToken: {
      jti: newJti,
      usuarioId: user.id,
      hash: hashRefreshToken(newRefreshToken.token),
      expiraEn: newRefreshToken.expiraEn,
      membresiaId: row.membresiaId ?? undefined,
    },
  });

  return { accessToken, refreshToken: newRefreshToken.token };
}

/**
 * D-E: idempotente y sin oráculo — solo revoca si el refresh presentado
 * pertenece al usuario autenticado; en cualquier otro caso responde igual
 * (el controller siempre devuelve 204).
 */
export async function logout(usuarioId: string, token: string): Promise<void> {
  let payload: Awaited<ReturnType<typeof verifyRefreshToken>>;
  try {
    payload = await verifyRefreshToken(token);
  } catch {
    return;
  }

  const row = await refreshTokenRepository.findByJti(payload.jti);
  if (row && row.usuarioId === usuarioId) {
    await refreshTokenRepository.revoke(row.jti);
  }
}

