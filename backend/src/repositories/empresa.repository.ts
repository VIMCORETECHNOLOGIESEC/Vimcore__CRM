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

export interface UpdateEmpresaAparienciaData {
  colorPrimario: string | null;
  colorSecundario: string | null;
  // Opcional (a diferencia de los dos colores arriba): `undefined` (campo no
  // enviado en el PATCH) deja el isotipo sin tocar -- Prisma omite del
  // `data` cualquier clave con valor `undefined`. `null` explícito sí
  // restaura "sin isotipo".
  logoUrl?: string | null;
}

/**
 * tema-empresarial-integracion (Tarea 3): única escritura de
 * `colorPrimario`/`colorSecundario` -- antes de este cambio ningún endpoint
 * modificaba estos campos (solo lectura vía `findById` y siembra vía
 * `seed.ts`). `id` siempre es el `empresaId` YA resuelto por
 * `requireAuthentication` (nunca un valor del cliente) -- ver
 * `services/empresa-apariencia.service.ts`.
 */
export async function updateApariencia(
  id: string,
  data: UpdateEmpresaAparienciaData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Empresa> {
  return client.empresa.update({ where: { id }, data });
}
