import { z } from "zod";

export const conversacionIdParamSchema = z.object({ id: z.uuid() });

const LIMITES_PERMITIDOS = [10, 25, 50, 100] as const;

/**
 * `GET /conversaciones` — paginación, mismo criterio que `listLeadsQuerySchema`.
 *
 * Hotfix: `clienteId` opcional — permite al frontend resolver qué
 * conversación abrir desde el detalle de un lead puntual. Aditivo: nunca
 * reemplaza el scope RBAC existente (`empresaId`/`asesorId`), ver
 * `conversaciones.service.ts::listConversaciones`.
 */
export const listConversacionesQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce
    .number()
    .int()
    .refine((v) => (LIMITES_PERMITIDOS as readonly number[]).includes(v), {
      message: "limite debe ser 10, 25, 50 o 100",
    })
    .default(25),
  clienteId: z.uuid().optional(),
});

/** `GET /conversaciones/:id/mensajes` — historial paginado, orden fijo por `enviadoEn desc`. */
export const listMensajesQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce
    .number()
    .int()
    .refine((v) => (LIMITES_PERMITIDOS as readonly number[]).includes(v), {
      message: "limite debe ser 10, 25, 50 o 100",
    })
    .default(25),
});

/** `POST /conversaciones/:id/mensajes` — el asesor responde. */
export const postMensajeBodySchema = z.object({
  texto: z.string().trim().min(1).max(4_096),
});

export type ConversacionIdParam = z.infer<typeof conversacionIdParamSchema>;
export type ListConversacionesQuery = z.infer<typeof listConversacionesQuerySchema>;
export type ListMensajesQuery = z.infer<typeof listMensajesQuerySchema>;
export type PostMensajeBody = z.infer<typeof postMensajeBodySchema>;
