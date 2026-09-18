import type { Holding } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

/**
 * holding-admin-gateway-auth (auth event provisioning): `holdings` has no RLS
 * (it defines the tenant boundary, like `empresas`), so these run without any
 * `TenantContext`.
 */
export async function findById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Holding | null> {
  return client.holding.findUnique({ where: { id } });
}

export async function create(
  data: { nombre: string },
  client: PrismaClientOrTransaction = prisma,
): Promise<Holding> {
  return client.holding.create({ data });
}
