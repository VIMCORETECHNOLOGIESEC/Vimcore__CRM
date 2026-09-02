import { Router } from "express";
import {
  getCita,
  getCitasListado,
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
// Vista de calendario (feature aditiva post-M7): `GET /citas` (sin `:citaId`)
// nunca colisiona con la ruta de abajo -- Express solo matchea `/citas/:citaId`
// contra un path con un segundo segmento presente. Mismo patrón sin
// `requireRole` -- autorización por listado dentro de `citas.service.ts::listCitas`.
citasRouter.get("/citas", requireAuthentication, getCitasListado);
citasRouter.get("/citas/:citaId", requireAuthentication, getCita);
citasRouter.post("/citas/:citaId/cancelar", requireAuthentication, postCancelarCita);
citasRouter.post("/citas/:citaId/reprogramar", requireAuthentication, postReprogramarCita);
citasRouter.post("/citas/:citaId/resultado", requireAuthentication, postResultadoCita);
