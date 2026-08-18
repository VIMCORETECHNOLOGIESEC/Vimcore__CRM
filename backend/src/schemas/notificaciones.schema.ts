import { z } from "zod";
export const notificationIdParamSchema = z.object({ id: z.uuid() });
export const listNotificationsQuerySchema = z.object({
  soloNoLeidas: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional()
    .default(false),
});
