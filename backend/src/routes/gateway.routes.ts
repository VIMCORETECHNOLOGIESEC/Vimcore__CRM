import { Router } from "express";
import {
  getCanalesManuales,
  patchCanalManual,
  postCanalManual,
} from "../controllers/canal-manual.controller.js";
import { requireGatewayTrust } from "../middlewares/require-gateway-trust.middleware.js";
import { requireRole } from "../middlewares/require-role.middleware.js";

export const gatewayRouter = Router();

// crm-gateway-proxy (CRM Gateway Trust, Architecture Decision #1): pilot ÚNICO
// de este proyecto -- solo `canales-manuales`, montado en `/internal/gateway`
// (app.ts), FUERA de `apiRouter`/`/api/v1` (ese prefijo es para el tráfico
// autenticado por JWT de `requireAuthentication`; este router es tráfico
// server-to-server ya validado por el Api Gateway, `requireGatewayTrust`).
//
// Mismo patrón EXACTO que `canal-manual.routes.ts` -- mismos controllers,
// mismo `requireRole` por endpoint -- solo cambia la guardia de identidad:
// `requireGatewayTrust` en vez de `requireAuthentication`. No duplicar lógica
// de negocio acá; esto es únicamente wiring.
gatewayRouter.post(
  "/canales-manuales",
  requireGatewayTrust,
  requireRole("ADMINISTRADOR"),
  postCanalManual,
);
gatewayRouter.patch(
  "/canales-manuales/:id",
  requireGatewayTrust,
  requireRole("ADMINISTRADOR"),
  patchCanalManual,
);
gatewayRouter.get(
  "/canales-manuales",
  requireGatewayTrust,
  requireRole("ADMINISTRADOR", "SUPERVISOR", "ASESOR"),
  getCanalesManuales,
);
