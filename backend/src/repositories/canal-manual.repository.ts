import type { CanalManual, Prisma } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

export interface CreateCanalManualData {
  empresaId: string;
  nombre: string;
}

/**
 * Bloque D (diseño): `@@unique([empresaId, nombre])` en el schema es la
 * guarda real contra duplicados -- este `create` deja que Postgres rechace
 * con P2002; `canal-manual.service.ts` lo traduce a un `AppError` de negocio
 * (409), nunca lo verifica con una consulta previa (evita una carrera de
 * lectura-luego-escritura). Mismo patrón que `producto.repository.ts::createProducto`.
 */
export async function createCanalManual(
  data: CreateCanalManualData,
  client: PrismaClientOrTransaction = prisma,
): Promise<CanalManual> {
  return client.canalManual.create({ data });
}

export async function findById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<CanalManual | null> {
  return client.canalManual.findUnique({ where: { id } });
}

export async function findMany(
  where: Prisma.CanalManualWhereInput,
  client: PrismaClientOrTransaction = prisma,
): Promise<CanalManual[]> {
  return client.canalManual.findMany({ where, orderBy: { nombre: "asc" } });
}

export interface UpdateCanalManualData {
  nombre?: string;
  activo?: boolean;
}

export async function updateCanalManual(
  id: string,
  data: UpdateCanalManualData,
  client: PrismaClientOrTransaction = prisma,
): Promise<CanalManual> {
  return client.canalManual.update({ where: { id }, data });
}
