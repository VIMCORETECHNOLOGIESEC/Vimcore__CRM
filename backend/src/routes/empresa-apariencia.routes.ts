import { Router } from "express";
import {
  getEmpresas,
  patchEmpresaApariencia,
  patchEmpresaAparienciaHolding,
} from "../controllers/empresa-apariencia.controller.js";
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

/**
 * PASO 8: admin cross-empresa, exclusivo sessionScope `holding` (guard
 * propio en el controller, separado del guard self-service de arriba) --
 * `/empresas/:empresaId` (a diferencia de `/empresas/actual`) porque el
 * propósito explícito es editar OTRA `Empresa`, identificada por el id de la
 * URL. Registrada DESPUÉS de la ruta estática de arriba: Express prueba las
 * rutas en orden de registro, así que `/empresas/actual/apariencia` sigue
 * resolviendo por la ruta estática y nunca cae en este `:empresaId`.
 */
empresaAparienciaRouter.patch(
  "/empresas/:empresaId/apariencia",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  patchEmpresaAparienciaHolding,
);

/**
 * PASO 8 (gap de gestor de empresas, detectado al implementar el frontend):
 * `GET /empresas` -- exclusivo sessionScope `holding`, mismo criterio de
 * autorización que el PATCH cross-empresa de arriba (`requireRole
 * ("ADMINISTRADOR")` + guard de `sessionScope` en el controller, reusando
 * `forbiddenSessionScope`). Vive en este mismo router porque comparte guard y
 * shape de respuesta (`EmpresaAparienciaHoldingView`) con las rutas de
 * apariencia holding -- no amerita un router propio todavía.
 */
empresaAparienciaRouter.get(
  "/empresas",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getEmpresas,
);
