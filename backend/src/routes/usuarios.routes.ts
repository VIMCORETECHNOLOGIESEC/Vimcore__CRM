import { Router } from "express";
import {
  deleteUsuario,
  getUsuarioById,
  getUsuarios,
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
