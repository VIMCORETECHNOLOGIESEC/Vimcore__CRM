import { z } from "zod";

const nonEmptyTextSchema = z.string().trim().min(1);
const linkedinIdSchema = z.union([nonEmptyTextSchema, z.number().int().nonnegative()]);

const localizedTextSchema = z.union([
  nonEmptyTextSchema,
  z
    .object({
      localized: z.record(z.string(), nonEmptyTextSchema).optional(),
      preferredLocale: z
        .object({
          country: z.string().trim().min(2).max(2).optional(),
          language: z.string().trim().min(2).max(8).optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough(),
]);

const linkedinUrnReferenceSchema = z.union([
  nonEmptyTextSchema,
  z
    .object({
      id: nonEmptyTextSchema.optional(),
      urn: nonEmptyTextSchema.optional(),
      organization: nonEmptyTextSchema.optional(),
      sponsoredAccount: nonEmptyTextSchema.optional(),
    })
    .passthrough(),
]);

export const linkedinLeadTypeSchema = z.enum(["SPONSORED", "EVENT", "COMPANY", "ORGANIZATION_PRODUCT"]);

export const linkedinLeadAnswerSchema = z
  .object({
    questionId: linkedinIdSchema.optional(),
    question: localizedTextSchema.optional(),
    predefinedField: nonEmptyTextSchema.optional(),
    answer: z.unknown().optional(),
    answers: z.array(z.unknown()).optional(),
    answerDetails: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const linkedinLeadConsentSchema = z
  .object({
    consentId: linkedinIdSchema.optional(),
    accepted: z.boolean().optional(),
    text: localizedTextSchema.optional(),
  })
  .passthrough();

export const linkedinLeadFormResponseSchema = z
  .object({
    id: nonEmptyTextSchema,
    submittedAt: z.coerce.date(),
    owner: linkedinUrnReferenceSchema,
    leadType: linkedinLeadTypeSchema,
    versionedLeadGenFormUrn: nonEmptyTextSchema,
    leadMetadataInfo: z
      .object({
        campaign: linkedinUrnReferenceSchema.optional(),
        campaignUrn: nonEmptyTextSchema.optional(),
        campaignName: nonEmptyTextSchema.optional(),
        creative: linkedinUrnReferenceSchema.optional(),
        creativeUrn: nonEmptyTextSchema.optional(),
      })
      .passthrough()
      .optional(),
    associatedEntity: linkedinUrnReferenceSchema.optional(),
    formResponse: z
      .object({
        answers: z.array(linkedinLeadAnswerSchema).default([]),
        consents: z.array(linkedinLeadConsentSchema).default([]),
        consentResponses: z.array(linkedinLeadConsentSchema).default([]),
      })
      .passthrough(),
  })
  .passthrough();

export const linkedinLeadFormQuestionSchema = z
  .object({
    questionId: linkedinIdSchema,
    predefinedField: nonEmptyTextSchema.optional(),
    name: localizedTextSchema.optional(),
    question: localizedTextSchema.optional(),
    hidden: z.boolean().optional(),
    multipleChoiceQuestionDetails: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const linkedinLeadFormSchema = z
  .object({
    id: linkedinIdSchema,
    versionedLeadGenFormUrn: nonEmptyTextSchema.optional(),
    name: localizedTextSchema.optional(),
    owner: linkedinUrnReferenceSchema.optional(),
    content: z
      .object({
        questions: z.array(linkedinLeadFormQuestionSchema).default([]),
        consents: z.array(linkedinLeadConsentSchema).default([]),
      })
      .passthrough()
      .optional(),
    questions: z.array(linkedinLeadFormQuestionSchema).optional(),
  })
  .passthrough();

export type LinkedInLeadType = z.infer<typeof linkedinLeadTypeSchema>;
export type LinkedInLeadAnswer = z.infer<typeof linkedinLeadAnswerSchema>;
export type LinkedInLeadConsent = z.infer<typeof linkedinLeadConsentSchema>;
export type LinkedInLeadFormResponseBody = z.infer<typeof linkedinLeadFormResponseSchema>;
export type LinkedInLeadFormQuestion = z.infer<typeof linkedinLeadFormQuestionSchema>;
export type LinkedInLeadFormBody = z.infer<typeof linkedinLeadFormSchema>;
