import { createHash, randomUUID } from "node:crypto";
import type { RolUsuario, Usuario } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt.js";
import { logger } from "../lib/logger.js";
import { verifyPassword } from "../lib/password.js";
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

async function issueTokenPair(user: Usuario): Promise<TokenPair> {
  const accessToken = await signAccessToken({ id: user.id, rol: user.rol });
  const jti = randomUUID();
  const refreshToken = await signRefreshToken({ id: user.id, jti });

  await refreshTokenRepository.create({
    jti,
    usuarioId: user.id,
    hash: hashRefreshToken(refreshToken.token),
    expiraEn: refreshToken.expiraEn,
  });

  return { accessToken, refreshToken: refreshToken.token };
}

/** D1, D2, D5: emite un par de tokens si el usuario está activo. */
export async function login(
  correo: string,
  password: string,
): Promise<TokenPair & { usuario: PublicUser }> {
  const user = await usuarioRepository.findByEmail(correo);
  if (!user) {
    throw invalidCredentials();
  }

  const isPasswordValid = await verifyPassword(user.passwordHash, password);
  if (!isPasswordValid) {
    throw invalidCredentials();
  }

  // Mismo código/mensaje que una contraseña incorrecta: sin oráculo de cuentas.
  if (!user.activo) {
    throw invalidCredentials();
  }

  const pair = await issueTokenPair(user);
  return { ...pair, usuario: toPublicUser(user) };
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

  const accessToken = await signAccessToken({ id: user.id, rol: user.rol });
  const newJti = randomUUID();
  const newRefreshToken = await signRefreshToken({ id: user.id, jti: newJti });

  await refreshTokenRepository.rotate({
    previousJti: row.jti,
    newToken: {
      jti: newJti,
      usuarioId: user.id,
      hash: hashRefreshToken(newRefreshToken.token),
      expiraEn: newRefreshToken.expiraEn,
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
