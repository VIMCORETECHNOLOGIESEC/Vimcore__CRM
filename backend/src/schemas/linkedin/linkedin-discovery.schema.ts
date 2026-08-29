import { z } from "zod";
import { linkedinLeadFormSchema } from "./linkedin-leads.schema.js";

const linkedinTextSchema = z.string().trim().min(1).max(4_000);
const linkedinIdSchema = z.union([linkedinTextSchema, z.number().int().nonnegative()]);
const localizedTextSchema = z.union([
  linkedinTextSchema,
  z
    .object({
      localized: z.record(z.string(), linkedinTextSchema).optional(),
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

const pagingSchema = z
  .object({
    start: z.number().int().nonnegative().optional(),
    count: z.number().int().positive().optional(),
    total: z.number().int().nonnegative().optional(),
  })
  .passthrough()
  .optional();

export const linkedinAdAccountSchema = z
  .object({
    id: linkedinIdSchema,
    name: localizedTextSchema.optional(),
    status: z.string().trim().min(1).max(128).optional(),
    reference: linkedinTextSchema.optional(),
  })
  .passthrough();

export const linkedinOrganizationAclSchema = z
  .object({
    organization: linkedinTextSchema.optional(),
    organizationTarget: linkedinTextSchema.optional(),
    role: z.string().trim().min(1).max(128).optional(),
    roles: z.array(z.string().trim().min(1).max(128)).optional(),
    state: z.string().trim().min(1).max(128).optional(),
  })
  .passthrough();

export const linkedinAdAccountsResponseSchema = z
  .object({
    elements: z.array(linkedinAdAccountSchema).default([]),
    paging: pagingSchema,
    metadata: z
      .object({
        nextPageToken: z.string().trim().min(1).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const linkedinOrganizationAclsResponseSchema = z
  .object({
    elements: z.array(linkedinOrganizationAclSchema).default([]),
    paging: pagingSchema,
  })
  .passthrough();

export const linkedinLeadFormsResponseSchema = z
  .object({
    elements: z.array(linkedinLeadFormSchema).default([]),
    paging: pagingSchema,
  })
  .passthrough();

export type LinkedInAdAccountBody = z.infer<typeof linkedinAdAccountSchema>;
export type LinkedInOrganizationAclBody = z.infer<typeof linkedinOrganizationAclSchema>;
export type LinkedInAdAccountsResponseBody = z.infer<typeof linkedinAdAccountsResponseSchema>;
export type LinkedInOrganizationAclsResponseBody = z.infer<typeof linkedinOrganizationAclsResponseSchema>;
export type LinkedInLeadFormsResponseBody = z.infer<typeof linkedinLeadFormsResponseSchema>;
