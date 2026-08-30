import type { ConfiguracionReporte } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

/**
 * reportes (Bloque E): uso interno de `jobs/reportes/reporte-generacion.job.ts`
 * para decidir qué secciones incluir en el PDF/XLSX generado -- SIN endpoint
 * propio en este batch (el negocio no pidió un CRUD de configuración en el
 * alcance de este cambio; el modelo se agrega tal cual lo especifica
 * docs/blocks/e-dashboards.md, sin inventar una API adicional). `empresaId:
 * null` = configuración default holding-wide (`@@unique([empresaId])`, doc
 * "Configuración por defecto").
 *
 * `findFirst`, no `findUnique`: el tipo generado por Prisma para
 * `ConfiguracionReporteWhereUniqueInput` tipa `empresaId` como
 * `string | undefined` (nunca acepta `null` en esa posición) -- reflejo
 * exacto del mismo caveat documentado en el modelo (schema.prisma): Postgres
 * no trata dos filas `empresa_id IS NULL` como colisión de `UNIQUE`, así que
 * Prisma tampoco expone una búsqueda "unique" real por NULL. `findFirst` es
 * la vía soportada para este caso (incluye `orderBy` por completitud, ante la
 * posibilidad latente de más de una fila default sin backfill que la impida).
 */
export async function findByEmpresaId(
  empresaId: string | null,
  client: PrismaClientOrTransaction = prisma,
): Promise<ConfiguracionReporte | null> {
  return client.configuracionReporte.findFirst({
    where: { empresaId },
    orderBy: { actualizadoEn: "desc" },
  });
}
