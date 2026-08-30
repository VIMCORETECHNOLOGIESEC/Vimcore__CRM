import { z } from "zod";

export const metaAdsOAuthStartQuerySchema = z.object({
  empresaId: z.uuid().optional(),
});

export const metaAdsOAuthCallbackQuerySchema = z
  .object({
    code: z.string().trim().min(1).max(2_048).optional(),
    state: z.string().trim().min(1).max(2_048).optional(),
    error: z.string().trim().min(1).max(256).optional(),
    error_description: z.string().trim().min(1).max(2_000).optional(),
  })
  .superRefine((query, ctx) => {
    if (query.error) {
      if (!query.state) {
        ctx.addIssue({ code: "custom", path: ["state"], message: "state es obligatorio cuando Meta informa error" });
      }
      return;
    }
    if (!query.code) {
      ctx.addIssue({ code: "custom", path: ["code"], message: "code es obligatorio en un callback exitoso" });
    }
    if (!query.state) {
      ctx.addIssue({ code: "custom", path: ["state"], message: "state es obligatorio en un callback exitoso" });
    }
  });

export const metaAdsConexionBodySchema = z.object({
  seleccion: z.string().trim().min(1),
  cuentaAnunciosIdExterno: z.string().trim().regex(/^act_\d+$/, "La cuenta de anuncios debe tener formato act_<id>"),
  empresaId: z.uuid().optional(),
});

export const metaAdsTokenResponseSchema = z
  .object({
    access_token: z.string().trim().min(1),
    token_type: z.string().optional(),
    expires_in: z.number().int().positive().optional(),
    granted_scopes: z.array(z.string()).optional(),
    scope: z.string().optional(),
  })
  .passthrough();

export type MetaAdsOAuthStartQuery = z.infer<typeof metaAdsOAuthStartQuerySchema>;
export type MetaAdsOAuthCallbackQuery = z.infer<typeof metaAdsOAuthCallbackQuerySchema>;
export type MetaAdsConexionBody = z.infer<typeof metaAdsConexionBodySchema>;
export type MetaAdsTokenResponseBody = z.infer<typeof metaAdsTokenResponseSchema>;
