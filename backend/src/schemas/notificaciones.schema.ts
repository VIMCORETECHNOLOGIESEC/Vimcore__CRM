import { z } from "zod";
export const notificationIdParamSchema = z.object({ id: z.uuid() });
export const listNotificationsQuerySchema = z.object({
  soloNoLeidas: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional()
    .default(false),
});
export const createNotificationSchema = z.object({
  recurso: z.enum(["canal", "producto"]),
  nombreSugerido: z.string().trim().min(1).max(200),
  mensaje: z.string().trim().min(1).max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
