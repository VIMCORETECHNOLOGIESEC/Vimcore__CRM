import { Router } from "express";
import {
  getReporteJobActivo,
  getReporteJobById,
  getReporteJobDescarga,
  postReporteJob,
} from "../../controllers/reportes/reportes.controller.js";
import { requireAuthentication } from "../../middlewares/require-authentication.middleware.js";
import { requireRole } from "../../middlewares/require-role.middleware.js";

export const reportesRouter = Router();

// docs/blocks/e-dashboards.md ("Exportación PDF/XLSX"): "Acceso: solo
// Supervisor y Administrador (empresa u holding) -- Asesor no". `requireRole`
// ya deja pasar SUPERVISOR_HOLDING/SUPER_ADMIN vía su bypass centralizado
// (Bloque F, `require-role.middleware.ts::ROLES_HOLDING_BYPASS`).
//
// `/reportes/jobs/activo` se registra ANTES de `/reportes/jobs/:id` --
// mismo motivo de siempre en Express: una ruta dinámica registrada primero
// capturaría "activo" como si fuera un `:id`.
reportesRouter.post(
  "/reportes/jobs",
  requireAuthentication,
  requireRole("ADMINISTRADOR", "SUPERVISOR"),
  postReporteJob,
);
reportesRouter.get(
  "/reportes/jobs/activo",
  requireAuthentication,
  requireRole("ADMINISTRADOR", "SUPERVISOR"),
  getReporteJobActivo,
);
reportesRouter.get(
  "/reportes/jobs/:id",
  requireAuthentication,
  requireRole("ADMINISTRADOR", "SUPERVISOR"),
  getReporteJobById,
);
reportesRouter.get(
  "/reportes/jobs/:id/descargar",
  requireAuthentication,
  requireRole("ADMINISTRADOR", "SUPERVISOR"),
  getReporteJobDescarga,
);
