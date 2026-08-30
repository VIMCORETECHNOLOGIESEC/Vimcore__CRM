import type { RefreshToken, SessionScope } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

export interface CreateRefreshTokenParams {
  jti: string;
  usuarioId: string;
  hash: string;
  expiraEn: Date;
  sessionScope: SessionScope;
  // Bloque B (dual-login-routing): `undefined` para toda sesión holding-wide
  // (`Usuario.correo`) — mismo comportamiento que antes de este cambio.
  // Presente solo cuando la sesión se emitió por el camino de `Membresia`.
  membresiaId?: string;
}

export async function create(
  params: CreateRefreshTokenParams,
): Promise<RefreshToken> {
  return prisma.refreshToken.create({ data: params });
}

export async function findByJti(jti: string): Promise<RefreshToken | null> {
  return prisma.refreshToken.findUnique({ where: { jti } });
}

export async function revoke(jti: string): Promise<void> {
  await prisma.refreshToken.update({
    where: { jti },
    data: { revocadoEn: new Date() },
  });
}

/**
 * D-D: revocación en cascada de toda la familia de refresh tokens del
 * usuario ante detección de reutilización. Solo toca filas aún vigentes
 * (`revocadoEn: null`) — revocar dos veces es un no-op idempotente.
 */
export async function revokeAllForUser(
  usuarioId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.refreshToken.updateMany({
    where: { usuarioId, revocadoEn: null },
    data: { revocadoEn: new Date() },
  });
}

export async function revokeAllForMembership(
  membresiaId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.refreshToken.updateMany({
    where: { membresiaId, revocadoEn: null },
    data: { revocadoEn: new Date() },
  });
}

/**
 * Rotación atómica (paso 7 del flujo de datos del diseño): revocar el `jti`
 * anterior y crear el nuevo en la misma transacción, para que nunca existan
 * dos refresh vigentes ni una ventana con cero.
 */
export async function rotate(
  params: {
    previousJti: string;
    newToken: CreateRefreshTokenParams;
  },
  client?: PrismaClientOrTransaction,
): Promise<RefreshToken> {
  if (client) {
    await client.refreshToken.update({
      where: { jti: params.previousJti },
      data: { revocadoEn: new Date() },
    });
    return client.refreshToken.create({ data: params.newToken });
  }

  return prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { jti: params.previousJti },
      data: { revocadoEn: new Date() },
    });
    return tx.refreshToken.create({ data: params.newToken });
  });
}
