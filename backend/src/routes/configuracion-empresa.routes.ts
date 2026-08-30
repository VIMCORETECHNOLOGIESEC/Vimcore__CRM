import { Router } from "express";
import {
  getConfiguracionEmpresa,
  patchConfiguracionEmpresa,
} from "../controllers/configuracion-empresa.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";
import { requireRole } from "../middlewares/require-role.middleware.js";

export const configuracionEmpresaRouter = Router();

// Cualquier usuario autenticado — el frontend lo consulta apenas después del
// login, antes de conocer el rol, para personalizar la pantalla de
// bienvenida (nombre visible + colores de marca).
configuracionEmpresaRouter.get(
  "/configuracion-empresa",
  requireAuthentication,
  getConfiguracionEmpresa,
);

// Edición exclusiva de ADMINISTRADOR.
configuracionEmpresaRouter.patch(
  "/configuracion-empresa",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  patchConfiguracionEmpresa,
);
