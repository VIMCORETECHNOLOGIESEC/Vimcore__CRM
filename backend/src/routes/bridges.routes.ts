import { Router } from "express";
import {
  deleteBridgeHandler,
  getBridge,
  getBridges,
  patchBridge,
  postBridge,
  postBridgeClave,
} from "../controllers/bridge.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";
import { requireRole } from "../middlewares/require-role.middleware.js";

export const bridgesRouter = Router();

// Requirement: Every /bridges endpoint requires authenticated ADMINISTRADOR.
// Guardado una sola vez a nivel de router (diseño: "unlike citas.routes.ts,
// there is no per-resource authorization here, so middleware-level RBAC is
// correct").
//
// NOTA (diseño DD "literal route segments registered before /:id"): PR3
// agrega `/bridges/catalogo/redes-soportadas` y `/bridges/redes-activas` —
// esos segmentos literales DEBEN registrarse ANTES de `/bridges/:id`, o
// Express los capturaría como `:id`. Esta rebanada (PR2) todavía no define
// esos segmentos literales.
bridgesRouter.get(
  "/bridges",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getBridges,
);
bridgesRouter.post(
  "/bridges",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  postBridge,
);
bridgesRouter.get(
  "/bridges/:id",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getBridge,
);
bridgesRouter.patch(
  "/bridges/:id",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  patchBridge,
);
bridgesRouter.delete(
  "/bridges/:id",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  deleteBridgeHandler,
);
bridgesRouter.post(
  "/bridges/:id/clave",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  postBridgeClave,
);
