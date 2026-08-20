import { Router } from "express";
import {
  getLeadById,
  getLeads,
  getLeadsRedesSociales,
  patchLeadEtapa,
  postLeadAsignar,
  postLeadFormulario,
  postLeadReasignar,
  postLeadsAsignarLote,
  postLeadTraspasar,
} from "../controllers/leads.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";
import { requireRole } from "../middlewares/require-role.middleware.js";

export const leadsRouter = Router();

// DD5 (diseño M5): sin `requireRole` — D4 es autorización por recurso, no
// expresable con roles fijos; vive en `leads.service.ts`.
leadsRouter.get("/leads", requireAuthentication, getLeads);
// Segmento literal registrado ANTES de "/leads/:id" (mismo cuidado de orden
// de rutas que "/bridges/catalogo/redes-soportadas" en bridges.routes.ts y
// "/usuarios/responsables" en usuarios.routes.ts) — si se registrara después,
// Express capturaría "catalogo" como el parámetro `:id`.
leadsRouter.get("/leads/catalogo/redes-sociales", requireAuthentication, getLeadsRedesSociales);
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

// Diseño D-A1: mismo requireRole que /leads/:id/asignar (Admin/Supervisor).
// Sin colisión de rutas — "/leads/asignar-lote" (2 segmentos, POST) no
// matchea "/leads/:id/asignar" (3 segmentos) ni "GET /leads/:id" (otro
// verbo). El orden de registro es indiferente para este caso, pero se
// coloca junto al resto de endpoints de asignación por legibilidad.
leadsRouter.post(
  "/leads/asignar-lote",
  requireAuthentication,
  requireRole("ADMINISTRADOR", "SUPERVISOR"),
  postLeadsAsignarLote,
);
