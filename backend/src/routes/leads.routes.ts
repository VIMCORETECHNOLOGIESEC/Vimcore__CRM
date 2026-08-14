import { Router } from "express";
import { getLeadById, getLeads, patchLeadEtapa } from "../controllers/leads.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";

export const leadsRouter = Router();

// DD5 (diseño M5): sin `requireRole` — D4 es autorización por recurso, no
// expresable con roles fijos; vive en `leads.service.ts`.
leadsRouter.get("/leads", requireAuthentication, getLeads);
leadsRouter.get("/leads/:id", requireAuthentication, getLeadById);
leadsRouter.patch("/leads/:id/etapa", requireAuthentication, patchLeadEtapa);
