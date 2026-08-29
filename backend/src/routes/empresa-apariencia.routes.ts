import { Router } from "express";
import { patchEmpresaApariencia } from "../controllers/empresa-apariencia.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";
import { requireRole } from "../middlewares/require-role.middleware.js";

export const empresaAparienciaRouter = Router();

/**
 * Self-service: el ADMINISTRADOR de una empresa edita/restaura el color
 * propio de SU empresa. `/empresas/actual` (no `/empresas/:id`) porque la
 * autoridad sale siempre de la sesión (`req.user.empresaId`), nunca de un id
 * en la URL -- ver la guarda adicional de `sessionScope` en el controller.
 */
empresaAparienciaRouter.patch(
  "/empresas/actual/apariencia",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  patchEmpresaApariencia,
);
