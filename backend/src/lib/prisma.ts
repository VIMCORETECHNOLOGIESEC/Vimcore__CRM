import { Prisma, PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Alias compartido para repositorios que aceptan tanto el cliente global
 * como un `Prisma.TransactionClient` (D-M3): permite que funciones de
 * distintos repositorios corran dentro de la misma transacción sin duplicar
 * este tipo en cada archivo.
 */
export type PrismaClientOrTransaction = typeof prisma | Prisma.TransactionClient;

/** Límites de espera/duración de una transacción interactiva de Prisma. */
export interface TransactionBounds {
  maxWait: number;
  timeout: number;
}

/**
 * Límites de la transacción de `deduplicarLead` cuando abre la suya propia
 * (M3, sin cambios de comportamiento).
 */
export const DEDUPLICACION_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: 10_000,
  timeout: 20_000,
};

/**
 * Límites de la transacción de `ingesta.service` (M4): envuelve a
 * `deduplicarLead` más los pasos de recepción/log, así que su `timeout` debe
 * ser mayor o igual al de dedup. Se deriva del bound de dedup, nunca se
 * duplica, para que "igual-o-más-amplio" sea estructural (DD3, diseño M4).
 */
export const INGESTA_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: DEDUPLICACION_TRANSACTION_BOUNDS.maxWait,
  timeout: DEDUPLICACION_TRANSACTION_BOUNDS.timeout + 10_000,
};

/**
 * Seam D1 (diseño M4, DD1c): si el llamador ya trae una transacción externa
 * (`txExterna`), `fn` corre dentro de ella y `bounds` se ignora — nunca se
 * abre una segunda transacción/conexión (precondición de DD2). Si no,
 * `runInTransaction` abre su propia `prisma.$transaction` con `bounds`,
 * igual que antes de este seam (comportamiento por defecto preservado).
 */
export async function runInTransaction<T>(
  txExterna: Prisma.TransactionClient | undefined,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  bounds: TransactionBounds,
): Promise<T> {
  if (txExterna !== undefined) {
    return fn(txExterna);
  }
  return prisma.$transaction(fn, bounds);
}
