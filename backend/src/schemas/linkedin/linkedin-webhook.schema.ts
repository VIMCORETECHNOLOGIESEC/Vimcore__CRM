import { z } from "zod";

const nonEmptyTextSchema = z.string().trim().min(1);

const linkedinReferenceObjectSchema = z
  .object({
    id: nonEmptyTextSchema.optional(),
    urn: nonEmptyTextSchema.optional(),
  })
  .passthrough();

const linkedinReferenceSchema = z.union([nonEmptyTextSchema, linkedinReferenceObjectSchema]);

export const linkedinWebhookChallengeQuerySchema = z.object({
  challengeCode: z.string().trim().min(1).max(2_048),
  applicationId: z.string().trim().min(1).max(256).optional(),
});

/**
 * Notificación Lead Sync con forma flexible: LinkedIn puede envolver las URNs
 * como texto o como objetos Rest.li. Se exige ID de notificación y se preservan
 * campos desconocidos para auditoría/adaptación futura.
 */
export const linkedinNotificationSchema = z
  .object({
    id: nonEmptyTextSchema.optional(),
    notificationId: nonEmptyTextSchema.optional(),
    leadFormResponseId: nonEmptyTextSchema.optional(),
    leadFormResponse: linkedinReferenceSchema.optional(),
    leadGenFormResponse: linkedinReferenceSchema.optional(),
    ownerUrn: nonEmptyTextSchema.optional(),
    owner: linkedinReferenceSchema.optional(),
    versionedFormUrn: nonEmptyTextSchema.optional(),
    versionedLeadGenFormUrn: nonEmptyTextSchema.optional(),
    versionedLeadGenForm: linkedinReferenceSchema.optional(),
    leadType: z.enum(["SPONSORED", "EVENT", "COMPANY", "ORGANIZATION_PRODUCT"]).optional(),
    createdAt: z.union([z.coerce.date(), z.number().int().nonnegative()]).optional(),
  })
  .passthrough()
  .superRefine((notification, ctx) => {
    if (!notification.id && !notification.notificationId) {
      ctx.addIssue({
        code: "custom",
        path: ["notificationId"],
        message: "La notificación de LinkedIn debe incluir id o notificationId",
      });
    }
  });

export const linkedinWebhookPayloadSchema = z.union([
  z.array(linkedinNotificationSchema),
  z
    .object({
      notifications: z.array(linkedinNotificationSchema).default([]),
    })
    .passthrough(),
]);

export type LinkedInWebhookChallengeQuery = z.infer<typeof linkedinWebhookChallengeQuerySchema>;
export type LinkedInNotificationBody = z.infer<typeof linkedinNotificationSchema>;
export type LinkedInWebhookPayload = z.infer<typeof linkedinWebhookPayloadSchema>;
