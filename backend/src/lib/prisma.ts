import { Prisma, PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Alias compartido para repositorios que aceptan tanto el cliente global
 * como un `Prisma.TransactionClient` (D-M3): permite que funciones de
 * distintos repositorios corran dentro de la misma transacción sin duplicar
 * este tipo en cada archivo.
 */
export type PrismaClientOrTransaction = typeof prisma | Prisma.TransactionClient;
