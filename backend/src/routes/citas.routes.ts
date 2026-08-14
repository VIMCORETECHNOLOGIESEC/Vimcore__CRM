import { Router } from "express";
import {
  getCita,
  getCitasPorLead,
  postCancelarCita,
  postCita,
  postReprogramarCita,
  postResultadoCita,
} from "../controllers/citas.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";

export const citasRouter = Router();

// M7 (diseño): sin `requireRole` — mismo patrón DD5/D8 de M5/M6, autorización
// por recurso (`canRead`/`canEdit` de `leads.access.ts`, reutilizados sin
// duplicar la regla) evaluada dentro de `citas.service.ts`, nunca en middleware.
citasRouter.post("/leads/:id/citas", requireAuthentication, postCita);
citasRouter.get("/leads/:id/citas", requireAuthentication, getCitasPorLead);
citasRouter.get("/citas/:citaId", requireAuthentication, getCita);
citasRouter.post("/citas/:citaId/cancelar", requireAuthentication, postCancelarCita);
citasRouter.post("/citas/:citaId/reprogramar", requireAuthentication, postReprogramarCita);
citasRouter.post("/citas/:citaId/resultado", requireAuthentication, postResultadoCita);
