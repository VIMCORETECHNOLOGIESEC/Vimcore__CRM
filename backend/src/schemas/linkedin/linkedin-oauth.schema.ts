import { z } from "zod";

const oauthTokenSchema = z.string().trim().min(1).max(10_000);
const oauthTextParamSchema = z.string().trim().min(1).max(2_048);

export const linkedinOAuthStartParamsSchema = z.object({ id: z.uuid() });

/**
 * Callback OAuth: LinkedIn vuelve con éxito (`code` + `state`) o con error,
 * pero nunca se acepta una mezcla silenciosa de ambas ramas.
 */
export const linkedinOAuthCallbackQuerySchema = z
  .object({
    code: oauthTextParamSchema.optional(),
    state: oauthTextParamSchema.optional(),
    error: z.string().trim().min(1).max(256).optional(),
    error_description: z.string().trim().min(1).max(2_000).optional(),
  })
  .superRefine((query, ctx) => {
    if (query.error) {
      if (query.code) {
        ctx.addIssue({
          code: "custom",
          path: ["code"],
          message: "El callback de LinkedIn no puede mezclar code y error",
        });
      }

      if (!query.state) {
        ctx.addIssue({
          code: "custom",
          path: ["state"],
          message: "state es obligatorio cuando LinkedIn informa error",
        });
      }

      return;
    }

    if (query.error_description) {
      ctx.addIssue({
        code: "custom",
        path: ["error_description"],
        message: "error_description solo es válido cuando LinkedIn informa error",
      });
    }

    if (!query.code) {
      ctx.addIssue({ code: "custom", path: ["code"], message: "code es obligatorio en un callback exitoso" });
    }

    if (!query.state) {
      ctx.addIssue({ code: "custom", path: ["state"], message: "state es obligatorio en un callback exitoso" });
    }
  });

export const linkedinTokenResponseSchema = z
  .object({
    access_token: oauthTokenSchema,
    expires_in: z.number().int().positive(),
    refresh_token: oauthTokenSchema.optional(),
    refresh_token_expires_in: z.number().int().positive().optional(),
    scope: z.string().trim().min(1).max(4_000),
    token_type: z.string().trim().min(1).max(64).optional(),
  })
  .passthrough();

export type LinkedInOAuthStartParams = z.infer<typeof linkedinOAuthStartParamsSchema>;
export type LinkedInOAuthCallbackQuery = z.infer<typeof linkedinOAuthCallbackQuerySchema>;
export type LinkedInTokenResponseBody = z.infer<typeof linkedinTokenResponseSchema>;
