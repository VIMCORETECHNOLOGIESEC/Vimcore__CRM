import { Router } from "express";
import {
  getLeadById,
  getLeads,
  patchLeadEtapa,
  postLeadAsignar,
  postLeadFormulario,
  postLeadReasignar,
  postLeadTraspasar,
} from "../controllers/leads.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";
import { requireRole } from "../middlewares/require-role.middleware.js";

export const leadsRouter = Router();

// DD5 (diseño M5): sin `requireRole` — D4 es autorización por recurso, no
// expresable con roles fijos; vive en `leads.service.ts`.
leadsRouter.get("/leads", requireAuthentication, getLeads);
leadsRouter.get("/leads/:id", requireAuthentication, getLeadById);
leadsRouter.patch("/leads/:id/etapa", requireAuthentication, patchLeadEtapa);
// D16: recalificación sin mover la etapa — reutiliza applyFormulario (PR2).
leadsRouter.post("/leads/:id/formulario", requireAuthentication, postLeadFormulario);

// M6 (diseño, D8): primer `requireRole` de este router — asignar es el único
// de los tres que restringe por rol fijo (Admin/Supervisor); reasignar y
// traspasar usan la regla híbrida rol+recurso de `leads.access.ts`,
// evaluada dentro de `asignacion.service.ts`, nunca en middleware.
leadsRouter.post(
  "/leads/:id/asignar",
  requireAuthentication,
  requireRole("ADMINISTRADOR", "SUPERVISOR"),
  postLeadAsignar,
);
leadsRouter.post("/leads/:id/reasignar", requireAuthentication, postLeadReasignar);
leadsRouter.post("/leads/:id/traspasar", requireAuthentication, postLeadTraspasar);
