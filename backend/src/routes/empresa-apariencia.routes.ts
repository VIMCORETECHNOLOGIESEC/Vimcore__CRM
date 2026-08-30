import { Router } from "express";
import {
  getEmpresa,
  getEmpresas,
  patchEmpresaApariencia,
  patchEmpresaAparienciaHolding,
  postEmpresa,
  postEmpresaAparienciaLogo,
} from "../controllers/empresa-apariencia.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";
import { requireRole } from "../middlewares/require-role.middleware.js";
import { uploadLogoMiddleware } from "../middlewares/upload-logo.middleware.js";

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
 * Subida de isotipo (logo) real como archivo, adicional al `logoUrl` de
 * texto libre del PATCH de arriba (que sigue intacto -- un admin puede
 * seguir pegando a mano la URL de un CDN externo ya existente). Mismo guard
 * self-service que el PATCH: ADMINISTRADOR de una sesión `company` sobre SU
 * PROPIA empresa. `uploadLogoMiddleware` (Multer, `memoryStorage`) parsea el
 * multipart y valida tipo/tamaño ANTES de que la request llegue al
 * controller -- ver `middlewares/upload-logo.middleware.ts`.
 */
empresaAparienciaRouter.post(
  "/empresas/actual/apariencia/logo",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  uploadLogoMiddleware,
  postEmpresaAparienciaLogo,
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

/**
 * Alta de empresa nueva -- mismo criterio de autorización que `GET /empresas`
 * de arriba (`requireRole("ADMINISTRADOR")` + guard de `sessionScope` en el
 * controller): solo holding-wide puede crear una `Empresa`.
 */
empresaAparienciaRouter.post(
  "/empresas",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  postEmpresa,
);

/**
 * `GET /empresas/:empresaId` (pedido explícito de frontend, ver controller):
 * registrada DESPUÉS de `POST /empresas`/`GET /empresas` de arriba, aunque el
 * orden entre ambas no afecta el matching de Express -- son shapes de ruta
 * distintos (`/empresas` de 1 segmento vs. `/empresas/:empresaId` de 2).
 * Mismo criterio de autorización que el resto de este bloque holding-wide.
 */
empresaAparienciaRouter.get(
  "/empresas/:empresaId",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getEmpresa,
);
