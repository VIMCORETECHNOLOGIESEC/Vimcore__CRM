import type { Prisma, RefreshToken } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * Permite que las funciones de este repositorio corran dentro de una
 * transacción ajena (p. ej. la baja lógica de `usuario.repository.ts`,
 * D3) sin duplicar la lógica de revocación en cascada. Por defecto usan el
 * cliente global `prisma`, igual que antes.
 */
type PrismaClientOrTransaction = typeof prisma | Prisma.TransactionClient;

export interface CrearRefreshTokenParams {
  jti: string;
  usuarioId: string;
  hash: string;
  expiraEn: Date;
}

export async function create(
  params: CrearRefreshTokenParams,
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

/**
 * Rotación atómica (paso 7 del flujo de datos del diseño): revocar el `jti`
 * anterior y crear el nuevo en la misma transacción, para que nunca existan
 * dos refresh vigentes ni una ventana con cero.
 */
export async function rotate(params: {
  previousJti: string;
  newToken: CrearRefreshTokenParams;
}): Promise<RefreshToken> {
  const [, created] = await prisma.$transaction([
    prisma.refreshToken.update({
      where: { jti: params.previousJti },
      data: { revocadoEn: new Date() },
    }),
    prisma.refreshToken.create({ data: params.newToken }),
  ]);

  return created;
}
