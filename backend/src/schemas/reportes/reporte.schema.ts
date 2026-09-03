import { RedSocial } from "@prisma/client";
import { z } from "zod";
import { finDiaUTC } from "../../lib/rango-fechas.js";

export const idParamSchema = z.object({ id: z.uuid() });

const RANGOS_PRESET_REPORTE = ["hoy", "7d", "30d", "mes_actual", "mes_anterior", "personalizado"] as const;

/**
 * reportes (Bloque E, docs/blocks/e-dashboards.md "Exportación PDF/XLSX"):
 * subconjunto propio del mismo contrato que `metricas.schema.ts::
 * metricasQuerySchema` -- deliberadamente REDECLARADO acá en vez de
 * importado, para no acoplar este módulo a un archivo (`metricas.service.ts`,
 * y potencialmente su schema) que otro batch está editando en paralelo AHORA
 * MISMO con las extensiones de dashboard de Bloque E (embudo de Oportunidad,
 * por producto, etc. -- ver cabecera de `reportes.service.ts`).
 *
 * `empresaId` es el único campo nuevo respecto de `metricasQuerySchema`:
 * selección explícita de una empresa dentro del holding. NUNCA se confía tal
 * cual -- `reportes.access.ts::resolverEmpresaIdReporte` la valida siempre
 * server-side contra las `Membresia` activas del solicitante antes de crear
 * el `ReporteJob` (docs/blocks/e-dashboards.md, "Scope empresarial de
 * ReporteJob").
 */
export const reporteParametrosSchema = z
  .object({
    rango: z.enum(RANGOS_PRESET_REPORTE).default("30d"),
    desde: z.coerce.date().optional(),
    hasta: z.coerce
      .date()
      .optional()
      .transform((v) => (v === undefined ? undefined : finDiaUTC(v))),
    redSocial: z.enum(RedSocial).optional(),
    campania: z.string().trim().min(1).optional(),
    responsableId: z.uuid().optional(),
    empresaId: z.uuid().optional(),
    // pdf-ejecutivo: selección de plantilla del PDF -- ADITIVO, el PDF
    // "detallado" (5 secciones ya existentes) sigue siendo el default y no
    // se toca. Solo aplica cuando `tipo === "pdf"` -- para `tipo === "xlsx"`
    // este campo se ignora sin error (el xlsx no cambia), a propósito no hay
    // ningún `.refine` acá que lo prohíba fuera de "pdf": este schema
    // (`reporteParametrosSchema`) es compartido por ambos `tipo`, y
    // acoplarlo al `tipo` hermano (otro campo del mismo objeto padre,
    // `crearReporteJobBodySchema`) requeriría un `superRefine` a nivel de
    // ese padre, no de este subschema -- no vale la pena la complejidad para
    // un campo que ya es un no-op inofensivo del lado del xlsx.
    plantilla: z.enum(["detallado", "ejecutivo"]).default("detallado"),
  })
  .superRefine((data, ctx) => {
    if (data.rango !== "personalizado") return;

    if (!data.desde || !data.hasta) {
      ctx.addIssue({
        code: "custom",
        message: "desde y hasta son obligatorios cuando rango=personalizado",
        path: ["rango"],
      });
      return;
    }

    if (data.desde > data.hasta) {
      ctx.addIssue({ code: "custom", message: "desde no puede ser posterior a hasta", path: ["desde"] });
    }
  });

export const tipoReporteSchema = z.enum(["pdf", "xlsx"]);

export const crearReporteJobBodySchema = z.object({
  tipo: tipoReporteSchema,
  parametros: reporteParametrosSchema,
});

export type IdParam = z.infer<typeof idParamSchema>;
export type ReporteParametros = z.infer<typeof reporteParametrosSchema>;
export type TipoReporte = z.infer<typeof tipoReporteSchema>;
export type CrearReporteJobBody = z.infer<typeof crearReporteJobBodySchema>;
