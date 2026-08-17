import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { assertAuthenticated } from "../lib/assert-authenticated.js";
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from "../schemas/notificaciones.schema.js";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notificaciones.service.js";
function invalidRequest(): AppError {
  return new AppError("validacion_invalida", 400, "La petición es inválida");
}
export async function getNotifications(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const parsed = listNotificationsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw invalidRequest();
  const notificaciones = await listNotifications(usuario.id, parsed.data.soloNoLeidas);
  res.status(200).json({ notificaciones });
}
export async function patchNotificationRead(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const parsed = notificationIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw invalidRequest();
  await markNotificationRead(parsed.data.id, usuario.id);
  res.status(204).send();
}
export async function patchAllNotificationsRead(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  await markAllNotificationsRead(usuario.id);
  res.status(204).send();
}
