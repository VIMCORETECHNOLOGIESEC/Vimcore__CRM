import { Router } from "express";
import {
  deleteUser,
  getUserById,
  getUsers,
  patchUser,
  postUser,
} from "../controllers/usuarios.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";
import { requireRole } from "../middlewares/require-role.middleware.js";

export const usuariosRouter = Router();

// D9: los 5 endpoints del CRUD son exclusivos de ADMINISTRADOR.
usuariosRouter.post(
  "/usuarios",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  postUser,
);
usuariosRouter.get(
  "/usuarios",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getUsers,
);
usuariosRouter.get(
  "/usuarios/:id",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getUserById,
);
usuariosRouter.patch(
  "/usuarios/:id",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  patchUser,
);
usuariosRouter.delete(
  "/usuarios/:id",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  deleteUser,
);
