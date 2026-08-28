import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "../config/env.js";

/**
 * D-C: HS256, secreto único, claim `type` obligatorio y verificado
 * explícitamente en cada camino. Un único servicio emite y verifica ambos
 * tipos de token; el claim distingue el uso, nunca se infiere del endpoint.
 */
const ISSUER = "crm-embudo-leads";
const AUDIENCE = "crm-api";
const secretKey = new TextEncoder().encode(env.JWT_SECRET);

export interface AccessTokenPayload extends JWTPayload {
  sub: string;
  rol: string;
  type: "access";
  sessionScope: "company" | "holding";
  // Bloque B (dual-login-routing): additivos, presentes solo cuando la
  // sesión se emitió por el camino de `Membresia` (empresa) — `undefined` en
  // toda sesión holding-wide (`Usuario.correo`), como antes de este cambio.
  membresiaId?: string;
  empresaId?: string;
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string;
  jti: string;
  type: "refresh";
}

export interface SignedRefreshToken {
  token: string;
  jti: string;
  expiraEn: Date;
}

export async function signAccessToken(user: {
  id: string;
  rol: string;
  sessionScope: "company" | "holding";
  membresiaId?: string;
  empresaId?: string;
}): Promise<string> {
  const expSeconds = Math.floor(Date.now() / 1000) + env.JWT_ACCESS_TTL_SECONDS;

  const claims: Record<string, unknown> = {
    rol: user.rol,
    type: "access",
    sessionScope: user.sessionScope,
  };
  if (user.membresiaId !== undefined) claims.membresiaId = user.membresiaId;
  if (user.empresaId !== undefined) claims.empresaId = user.empresaId;

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expSeconds)
    .sign(secretKey);
}

export async function signRefreshToken(params: {
  id: string;
  jti?: string;
}): Promise<SignedRefreshToken> {
  const jti = params.jti ?? randomUUID();
  const expSeconds = Math.floor(Date.now() / 1000) + env.JWT_REFRESH_TTL_SECONDS;

  const token = await new SignJWT({ type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.id)
    .setJti(jti)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expSeconds)
    .sign(secretKey);

  return { token, jti, expiraEn: new Date(expSeconds * 1000) };
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  if (payload.type !== "access" || typeof payload.sub !== "string") {
    throw new Error("Token no es de tipo access");
  }

  return payload as AccessTokenPayload;
}

export async function verifyRefreshToken(
  token: string,
): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  if (
    payload.type !== "refresh" ||
    typeof payload.sub !== "string" ||
    typeof payload.jti !== "string"
  ) {
    throw new Error("Token no es de tipo refresh");
  }

  return payload as RefreshTokenPayload;
}
