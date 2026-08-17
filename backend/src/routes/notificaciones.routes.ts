import { Router } from "express";
import {
  getNotifications,
  patchAllNotificationsRead,
  patchNotificationRead,
} from "../controllers/notificaciones.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";
export const notificationsRouter = Router();
notificationsRouter.get("/notificaciones", requireAuthentication, getNotifications);
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
