import type { Empresa } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

/**
 * Bloque D0 (docs/blocks/d0-visualizacion-multitenant.md, "Extensión mínima
 * de GET /auth/perfil"): única lectura que necesita `auth.controller.ts` para
 * resolver `empresaNombre` de una sesión `company`. `empresas` NO tiene RLS
 * (es la tabla que define la frontera tenant, no una tabla scopeada por
 * tenant) — esta lectura por PK no requiere ningún `TenantContext`/GUC activo.
 */
export async function findById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Empresa | null> {
  return client.empresa.findUnique({ where: { id } });
}
