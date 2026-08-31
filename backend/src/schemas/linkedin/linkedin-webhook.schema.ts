import { z } from "zod";
import { linkedinLeadTypeSchema } from "./linkedin-leads.schema.js";

const nonEmptyTextSchema = z.string().trim().min(1);

export const linkedinWebhookChallengeQuerySchema = z.object({
  challengeCode: z.string().trim().min(1).max(2_048),
  applicationId: z.string().trim().min(1).max(256).optional(),
});

/**
 * Owner de la notificación Lead Sync (learn.microsoft.com/en-us/linkedin/
 * marketing/lead-sync/leadsync, FAQ "What content can I expect to be
 * included in the notification payloads?", verificado 2026-08-31): objeto
 * con EXACTAMENTE una key presente, `organization` o `sponsoredAccount` —
 * mismo criterio inverso que `linkedin-subscription.service.ts::ownerBodyFor`.
 * Modelado como objeto con ambas keys opcionales + `superRefine` (en vez de
 * `z.union` de dos objetos exclusivos) para que el tipo inferido permita
 * `owner.organization ?? owner.sponsoredAccount` directo, sin narrowing
 * adicional — misma ergonomía que `linkedinUrnReferenceSchema` en
 * `linkedin-leads.schema.ts`.
 */
export const linkedinNotificationOwnerSchema = z
  .object({
    organization: nonEmptyTextSchema.optional(),
    sponsoredAccount: nonEmptyTextSchema.optional(),
  })
  .passthrough()
  .superRefine((owner, ctx) => {
    const presentes = [owner.organization, owner.sponsoredAccount].filter(
      (valor) => valor !== undefined,
    ).length;
    if (presentes !== 1) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: "owner debe traer exactamente una de: organization, sponsoredAccount",
      });
    }
  });

export const linkedinLeadActionSchema = z.enum(["CREATED", "DELETED"]);

/**
 * Notificación real de Lead Sync (2026-08-31, REESCRITO: la forma previa de
 * este schema — un sobre `{ notifications: [...] }` o un array, con campos
 * especulativos como `leadFormResponseId`/`versionedFormUrn` — no coincide
 * con lo que LinkedIn realmente envía, según la doc oficial verificada. Es
 * un objeto JSON plano, UNA notificación por POST, sin envoltorio).
 * `associatedEntity` (p. ej. `{ "event": "urn:li:event:123" }`) se preserva
 * sin traducir — ningún flujo de este proyecto lo consume todavía.
 */
export const linkedinNotificationSchema = z
  .object({
    type: z.literal("LEAD_ACTION"),
    leadGenFormResponse: nonEmptyTextSchema,
    leadGenForm: nonEmptyTextSchema,
    owner: linkedinNotificationOwnerSchema,
    associatedEntity: z.record(z.string(), nonEmptyTextSchema).optional(),
    leadType: linkedinLeadTypeSchema,
    leadAction: linkedinLeadActionSchema,
    occurredAt: z.number().int().nonnegative(),
  })
  .passthrough();

export type LinkedInWebhookChallengeQuery = z.infer<typeof linkedinWebhookChallengeQuerySchema>;
export type LinkedInNotificationOwner = z.infer<typeof linkedinNotificationOwnerSchema>;
export type LinkedInLeadAction = z.infer<typeof linkedinLeadActionSchema>;
export type LinkedInNotificationBody = z.infer<typeof linkedinNotificationSchema>;
