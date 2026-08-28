import { Router } from "express";
import {
  deleteBridgeHandler,
  getBridge,
  getBridgeLogs,
  getBridges,
  getCuentasPublicitarias,
  getRedesActivas,
  getRedesSoportadas,
  patchBridge,
  patchCuentaPublicitaria,
  postBridge,
  postBridgeClave,
  postCuentaPublicitaria,
  postCuentaProbarConexion,
  postCuentaToken,
} from "../controllers/bridge.controller.js";
import {
  patchBridgeApiConexion,
  patchBridgeApiMapeo,
  postBridgeApiProbarConexion,
} from "../controllers/bridgeApi/configuracion.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";
import { requireRole } from "../middlewares/require-role.middleware.js";

export const bridgesRouter = Router();

// Cada endpoint exige autenticación + rol ADMINISTRADOR (Requirement: Every
// /bridges endpoint requires authenticated ADMINISTRADOR). A diferencia de
// citas.routes.ts, acá no hay autorización por recurso, así que el RBAC a
// nivel de middleware es correcto (diseño).
//
// DD "literal route segments registered before /:id" (diseño
// m4-bridges-crud-fundacion): `/bridges/catalogo/redes-soportadas` y
// `/bridges/redes-activas` son segmentos LITERALES y DEBEN registrarse antes
// que `/bridges/:id`, o Express los capturaría como `:id` (ver
// "route-ordering regression guard" en bridges.routes.test.ts).
bridgesRouter.get(
  "/bridges/catalogo/redes-soportadas",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getRedesSoportadas,
);
bridgesRouter.get(
  "/bridges/redes-activas",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getRedesActivas,
);
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
bridgesRouter.get(
  "/bridges/:id/logs",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getBridgeLogs,
);
bridgesRouter.post(
  "/bridges/:id/cuentas",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  postCuentaPublicitaria,
);
bridgesRouter.get(
  "/bridges/:id/cuentas",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getCuentasPublicitarias,
);
bridgesRouter.patch(
  "/bridges/:id/cuentas/:cuentaId",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  patchCuentaPublicitaria,
);
// docs/05-bridges.md §7 ("Carga y renovación de token con verificación
// inmediata de validez" / "Prueba de conexión bajo demanda").
bridgesRouter.post(
  "/bridges/:id/cuentas/:cuentaId/token",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  postCuentaToken,
);
bridgesRouter.post(
  "/bridges/:id/cuentas/:cuentaId/probar-conexion",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  postCuentaProbarConexion,
);
// bridgeApi (RedSocial.API_EXTERNA): carga/corrección de conexión y mapeo,
// separado del PATCH genérico de /bridges/:id -- devuelven 400 si el bridge
// no es de este redSocial (`services/bridgeApi/configuracion.service.ts`).
bridgesRouter.patch(
  "/bridges/:id/api-externa/conexion",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  patchBridgeApiConexion,
);
bridgesRouter.patch(
  "/bridges/:id/api-externa/mapeo",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  patchBridgeApiMapeo,
);
bridgesRouter.post(
  "/bridges/:id/api-externa/probar-conexion",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  postBridgeApiProbarConexion,
);
