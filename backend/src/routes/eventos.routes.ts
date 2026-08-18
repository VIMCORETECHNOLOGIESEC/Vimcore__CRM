import { Router } from "express";
import { getEvents } from "../controllers/eventos.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";

export const eventsRouter = Router();

eventsRouter.get("/eventos", requireAuthentication, getEvents);
