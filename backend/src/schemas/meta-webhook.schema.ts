import { z } from "zod";

/**
 * Zod valida en el borde (AGENTS.md §4.4, "nunca confiar en el payload de un
 * webhook") — el mismo principio que `ingesta.schema.ts`, aplicado a la
 * forma real de la notificación de leadgen de Meta (Webhooks for Leadgen
 * Guide). `changes` no filtrado por `field === "leadgen"` acá a propósito:
 * ese filtro es lógica de negocio de `meta-webhook.service.ts`, no de
 * validación de forma.
 */
const metaLeadgenChangeValueSchema = z.object({
  leadgen_id: z.string().trim().min(1),
  page_id: z.string().trim().min(1),
  form_id: z.string().trim().min(1).optional(),
  ad_id: z.string().trim().min(1).optional(),
  created_time: z.number().optional(),
});

const metaChangeSchema = z.object({
  field: z.string(),
  value: metaLeadgenChangeValueSchema,
});

const metaEntrySchema = z.object({
  id: z.string(),
  time: z.number().optional(),
  changes: z.array(metaChangeSchema).default([]),
});

export const metaWebhookNotificationSchema = z.object({
  object: z.string(),
  entry: z.array(metaEntrySchema).default([]),
});

export type MetaWebhookNotificationBody = z.infer<typeof metaWebhookNotificationSchema>;

/**
 * Respuesta de `GET /{leadgen_id}?fields=field_data,ad_id,form_id,campaign_name,ad_name,campaign_id`
 * (docs/05-bridges.md §3) — se valida también, porque es la respuesta de una
 * API externa, no un dato propio. `campaign_id` se agrega explícitamente
 * (2026-08-18): Graph API lo expone como field disponible en el detalle de un
 * `leadgen_id` y es el id real de campaña que `LeadEntrante.idExternoCampania`
 * necesita — `campaign_name` por sí solo no alcanza (ver `meta.adapter.ts`).
 */
const metaFieldDatumSchema = z.object({
  name: z.string(),
  values: z.array(z.string()).default([]),
});

export const metaLeadgenDetalleSchema = z.object({
  id: z.string(),
  field_data: z.array(metaFieldDatumSchema).optional(),
  ad_id: z.string().optional(),
  form_id: z.string().optional(),
  campaign_id: z.string().optional(),
  campaign_name: z.string().optional(),
  ad_name: z.string().optional(),
  created_time: z.string().optional(),
});

export type MetaLeadgenDetalle = z.infer<typeof metaLeadgenDetalleSchema>;
export type MetaFieldDatum = z.infer<typeof metaFieldDatumSchema>;
