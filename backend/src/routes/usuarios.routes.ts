import { Router } from "express";
import {
  deleteUsuario,
  getUsuarioById,
  getUsuarios,
  getUsuariosResponsables,
  patchUsuario,
  postUsuario,
} from "../controllers/usuarios.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";
import { requireRole } from "../middlewares/require-role.middleware.js";

export const usuariosRouter = Router();

// D9: los 5 endpoints del CRUD son exclusivos de ADMINISTRADOR.
usuariosRouter.post(
  "/usuarios",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  postUsuario,
);
usuariosRouter.get(
  "/usuarios",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getUsuarios,
);
// F3/F4 (diseño D-A1): DEBE registrarse ANTES de `/usuarios/:id` — si no,
// "responsables" sería capturado como `:id` por esa ruta (ADMINISTRADOR-only,
// distinta autorización) en lugar de llegar acá. Accesible a ADMINISTRADOR Y
// SUPERVISOR, a diferencia del resto del CRUD (D9, solo ADMINISTRADOR).
usuariosRouter.get(
  "/usuarios/responsables",
  requireAuthentication,
  requireRole("ADMINISTRADOR", "SUPERVISOR"),
  getUsuariosResponsables,
);
usuariosRouter.get(
  "/usuarios/:id",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getUsuarioById,
);
usuariosRouter.patch(
  "/usuarios/:id",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  patchUsuario,
);
usuariosRouter.delete(
  "/usuarios/:id",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  deleteUsuario,
);
