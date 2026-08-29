import type { Empresa } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

/**
 * Bloque D0 (docs/blocks/d0-visualizacion-multitenant.md, "Extensión mínima
 * de GET /auth/perfil"): única lectura que necesita `auth.service.ts` (vía
 * `resolveEmpresaMarca`) para resolver `empresaNombre` de una sesión
 * `company`. `empresas` NO tiene RLS (es la tabla que define la frontera
 * tenant, no una tabla scopeada por tenant) — esta lectura por PK no
 * requiere ningún `TenantContext`/GUC activo.
 *
 * tema-empresarial-integracion (Parte 2): sin `select` explícito, así que ya
 * devuelve `colorPrimario`/`colorSecundario` (nullable) junto con el resto
 * de la fila — no hizo falta ampliar la consulta, solo el modelo Prisma.
 */
export async function findById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Empresa | null> {
  return client.empresa.findUnique({ where: { id } });
}
