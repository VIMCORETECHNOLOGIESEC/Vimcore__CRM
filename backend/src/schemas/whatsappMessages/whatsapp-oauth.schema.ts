import { z } from "zod";

/** `GET /whatsapp/conectar` — solo un rol holding-wide necesita indicar la empresa destino (ver controller). */
export const whatsappOAuthStartQuerySchema = z.object({
  empresaId: z.uuid().optional(),
});

/**
 * `GET /whatsapp/callback` — mismo patrón que
 * `linkedinOAuthCallbackQuerySchema`: Meta vuelve con éxito (`code`+`state`)
 * o con error, nunca una mezcla silenciosa de ambas ramas.
 */
export const whatsappOAuthCallbackQuerySchema = z
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

/**
 * `POST /whatsapp/conexion` — `seleccion` es el blob opaco devuelto por
 * `GET /whatsapp/callback` (ver `WhatsAppOAuthCallbackDto`); el cliente lo
 * reenvía sin poder leerlo. `empresaId` solo se usa cuando el actor es
 * holding-wide (`req.user.empresaId === null`) — el controller lo ignora
 * para un actor scoped a una empresa (mismo criterio D9/D10 que
 * `asignacion.service.ts::resolveReceptor`).
 */
export const whatsappConexionBodySchema = z.object({
  seleccion: z.string().trim().min(1),
  numeroTelefonoId: z.string().trim().min(1),
  empresaId: z.uuid().optional(),
});

/** Respuesta de `GET {GRAPH_API_BASE_URL}/oauth/access_token` — validada por ser una API externa. */
export const whatsappTokenResponseSchema = z
  .object({
    access_token: z.string().trim().min(1),
    token_type: z.string().optional(),
    expires_in: z.number().int().positive().optional(),
  })
  .passthrough();

export type WhatsAppOAuthStartQuery = z.infer<typeof whatsappOAuthStartQuerySchema>;
export type WhatsAppOAuthCallbackQuery = z.infer<typeof whatsappOAuthCallbackQuerySchema>;
export type WhatsAppConexionBody = z.infer<typeof whatsappConexionBodySchema>;
export type WhatsAppTokenResponseBody = z.infer<typeof whatsappTokenResponseSchema>;
