import { RedSocial } from "@prisma/client";
import { z } from "zod";

/**
 * docs/08-dashboard-kpis.md §4 ("Rango de fechas"): los seis presets
 * literales del filtro. `personalizado` exige `desde`/`hasta` explícitos —
 * validado abajo con `superRefine` (mismo patrón condicional que
 * `patchEtapaBodySchema` en `leads.schema.ts`, salvo que acá la etapa
 * discriminante es un valor de query, no compatible con
 * `z.discriminatedUnion` porque el resto de los campos son comunes a los seis
 * presets).
 */
const RANGOS_PRESET = ["hoy", "7d", "30d", "mes_actual", "mes_anterior", "personalizado"] as const;
export type RangoPreset = (typeof RANGOS_PRESET)[number];

/**
 * Query params compartidos por los 7 endpoints de `GET /api/v1/metricas/...`
 * (docs/08 §4). `responsableId` (spec: "Solo administrador y supervisor") NO
 * se descarta acá — `metricas.access.ts::resolveResponsableIds` es quien
 * decide ignorarlo cuando el actor es Asesor/Vendedor, mismo criterio
 * estructural que `leads.schema.ts::listLeadsQuerySchema` (el schema no
 * conoce el rol del actor, solo valida forma).
 */
export const metricasQuerySchema = z
  .object({
    rango: z.enum(RANGOS_PRESET).default("30d"),
    desde: z.coerce.date().optional(),
    hasta: z.coerce.date().optional(),
    redSocial: z.enum(RedSocial).optional(),
    // DD2 (M4/M5): mismo criterio que `leads.schema.ts` — texto libre ILIKE
    // contra `payload_original ->> 'nombreCampania'`.
    campania: z.string().trim().min(1).optional(),
    responsableId: z.uuid().optional(),
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

export type MetricasQuery = z.infer<typeof metricasQuerySchema>;
