import { Router } from "express";
import {
  getOportunidadById,
  getOportunidades,
  patchOportunidadEtapa,
  postOportunidad,
  postOportunidadCerrar,
  postOportunidadReasignar,
} from "../../controllers/negociacion/oportunidad.controller.js";
import { getProductos, postProducto } from "../../controllers/negociacion/producto.controller.js";
import { requireAuthentication } from "../../middlewares/require-authentication.middleware.js";
import { requireRole } from "../../middlewares/require-role.middleware.js";

export const negociacionRouter = Router();

// negociacion (Bloque D, D14): catálogo de productos por empresa --
// ADMINISTRADOR gestiona (crea), cualquier rol autenticado lista (para
// elegir producto al crear una Oportunidad).
negociacionRouter.post("/productos", requireAuthentication, requireRole("ADMINISTRADOR"), postProducto);
negociacionRouter.get("/productos", requireAuthentication, getProductos);

// D3/D4/D7: sin `requireRole` fijo -- la autorización por recurso (lectura/
// edición/cierre) vive en `oportunidad.access.ts`, evaluada dentro de
// `oportunidad.service.ts`, mismo criterio que `leads.routes.ts`.
negociacionRouter.post("/oportunidades", requireAuthentication, postOportunidad);
negociacionRouter.get("/oportunidades", requireAuthentication, getOportunidades);
negociacionRouter.get("/oportunidades/:id", requireAuthentication, getOportunidadById);
negociacionRouter.patch("/oportunidades/:id/etapa", requireAuthentication, patchOportunidadEtapa);
negociacionRouter.post("/oportunidades/:id/cerrar", requireAuthentication, postOportunidadCerrar);

// D9: única excepción administrativa de este router restringida por rol fijo
// (ADMINISTRADOR/SUPERVISOR) -- mismo patrón que `/leads/:id/asignar` en
// `leads.routes.ts`.
negociacionRouter.post(
  "/oportunidades/:id/reasignar",
  requireAuthentication,
  requireRole("ADMINISTRADOR", "SUPERVISOR"),
  postOportunidadReasignar,
);
