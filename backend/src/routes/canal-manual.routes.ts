import { Router } from "express";
import {
  getCanalesManuales,
  patchCanalManual,
  postCanalManual,
} from "../controllers/canal-manual.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";
import { requireRole } from "../middlewares/require-role.middleware.js";

export const canalManualRouter = Router();

// Bloque D (diseño, "Canal de ingreso manual y catálogo dinámico"):
// "Gestión del catálogo en manos de Administrador; Supervisor y Asesor solo
// eligen de la lista" -- POST/PATCH restringidos por rol fijo (mismo patrón
// que `negociacionRouter.post("/productos", ...)`); `requireRole` ya
// bypassea SUPERVISOR_HOLDING/SUPER_ADMIN incondicionalmente
// (`require-role.middleware.ts`, Bloque F), así que no hace falta listarlos
// acá.
canalManualRouter.post(
  "/canales-manuales",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  postCanalManual,
);
canalManualRouter.patch(
  "/canales-manuales/:id",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  patchCanalManual,
);
// GET: mismo conjunto de roles que `leads.access.ts::canCreateManual`
// (Administrador/Supervisor/Asesor + holding vía el mismo bypass de arriba)
// -- Supervisor y Asesor necesitan listar para elegir canal al cargar un
// lead manual.
canalManualRouter.get(
  "/canales-manuales",
  requireAuthentication,
  requireRole("ADMINISTRADOR", "SUPERVISOR", "ASESOR"),
  getCanalesManuales,
);
