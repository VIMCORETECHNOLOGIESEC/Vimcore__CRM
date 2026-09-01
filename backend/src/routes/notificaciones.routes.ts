import { Router } from "express";
import {
  getNotifications,
  patchAllNotificationsRead,
  patchNotificationRead,
  postNotification,
  postWhatsAppNoConectadoNotification,
} from "../controllers/notificaciones.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";
import { requireRole } from "../middlewares/require-role.middleware.js";
export const notificationsRouter = Router();
notificationsRouter.get("/notificaciones", requireAuthentication, getNotifications);
notificationsRouter.post(
  "/notificaciones",
  requireAuthentication,
  requireRole("SUPERVISOR", "ASESOR"),
  postNotification,
);
notificationsRouter.post(
  "/notificaciones/whatsapp-no-conectado",
  requireAuthentication,
  requireRole("SUPERVISOR", "ASESOR"),
  postWhatsAppNoConectadoNotification,
);
notificationsRouter.patch(
  "/notificaciones/leer-todas",
  requireAuthentication,
  patchAllNotificationsRead,
);
notificationsRouter.patch(
  "/notificaciones/:id/leer",
  requireAuthentication,
  patchNotificationRead,
);
