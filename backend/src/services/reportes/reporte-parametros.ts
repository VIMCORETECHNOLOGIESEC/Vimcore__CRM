import type { Prisma } from "@prisma/client";
import type { MetricasQuery } from "../../schemas/metricas.schema.js";
import type { ReporteParametros } from "../../schemas/reportes/reporte.schema.js";

/**
 * reportes (Bloque E): forma JSON persistida en `ReporteJob.parametros`
 * (columna JSONB). `Prisma.InputJsonValue` no admite `Date` ni `undefined`
 * como valor -- `desde`/`hasta` se serializan a ISO 8601 y toda clave ausente
 * se omite del todo (nunca `campo: undefined`), para que dos llamadas con los
 * mismos parámetros produzcan el mismo JSON exacto (el bloqueo de generación
 * duplicada de `reporte-job.repository.ts::findActivoDuplicado` compara este
 * valor con `Prisma.equals`).
 */
export interface ParametrosReportePersistidos {
  rango: string;
  desde?: string;
  hasta?: string;
  redSocial?: string;
  campania?: string;
  responsableId?: string;
  empresaId?: string;
}

/**
 * `empresaIdResuelto` es SIEMPRE el valor que devolvió
 * `reportes.access.ts::resolverEmpresaIdReporte` -- nunca
 * `parametros.empresaId` tal cual llegó del cliente (docs/blocks/
 * e-dashboards.md, "Scope empresarial de ReporteJob"). `null` (holding-wide)
 * omite la clave del todo.
 */
export function serializarParametros(
  parametros: ReporteParametros,
  empresaIdResuelto: string | null,
): ParametrosReportePersistidos {
  return {
    rango: parametros.rango,
    ...(parametros.desde ? { desde: parametros.desde.toISOString() } : {}),
    ...(parametros.hasta ? { hasta: parametros.hasta.toISOString() } : {}),
    ...(parametros.redSocial ? { redSocial: parametros.redSocial } : {}),
    ...(parametros.campania ? { campania: parametros.campania } : {}),
    ...(parametros.responsableId ? { responsableId: parametros.responsableId } : {}),
    ...(empresaIdResuelto ? { empresaId: empresaIdResuelto } : {}),
  };
}

/** Vista `Prisma.InputJsonValue`-compatible del mismo valor, para persistir/comparar contra la BD. */
export function comoJson(parametros: ParametrosReportePersistidos): Prisma.InputJsonValue {
  return { ...parametros };
}

/**
 * Reconstruye un `MetricasQuery` (contrato ya establecido de
 * `metricas.service.ts`) a partir de lo persistido en `ReporteJob.parametros`
 * -- usado por `jobs/reportes/reporte-generacion.job.ts` para reusar
 * exactamente las mismas funciones de agregación que ya alimentan el
 * dashboard (docs/blocks/e-dashboards.md, "Alcance": "cero lógica de negocio
 * duplicada"). `empresaId` NO se proyecta acá -- ese valor gobierna el
 * `TenantContext` de `runWithTenantContext` (que a su vez determina el
 * alcance de `usuario.empresaId` que consumen `resolveAlcanceBase`/
 * `resolveFiltroSql`), nunca un campo de `MetricasQuery` en sí (ese schema no
 * lo tiene, ver `metricas.schema.ts`).
 */
export function aMetricasQuery(parametros: ParametrosReportePersistidos): MetricasQuery {
  return {
    rango: parametros.rango as MetricasQuery["rango"],
    desde: parametros.desde ? new Date(parametros.desde) : undefined,
    hasta: parametros.hasta ? new Date(parametros.hasta) : undefined,
    redSocial: parametros.redSocial as MetricasQuery["redSocial"],
    campania: parametros.campania,
    responsableId: parametros.responsableId,
  };
}
