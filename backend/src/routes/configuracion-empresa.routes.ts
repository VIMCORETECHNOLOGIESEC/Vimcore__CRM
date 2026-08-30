import { Router } from "express";
import {
  getConfiguracionEmpresa,
  patchConfiguracionEmpresa,
  postConfiguracionEmpresaLogo,
} from "../controllers/configuracion-empresa.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";
import { requireRole } from "../middlewares/require-role.middleware.js";
import { uploadLogoMiddleware } from "../middlewares/upload-logo.middleware.js";

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

// Subida de isotipo (logo) real como archivo, adicional al `logoUrl` de
// texto libre del PATCH de arriba (que sigue intacto). Mismo rol exclusivo
// ADMINISTRADOR. `uploadLogoMiddleware` (Multer, `memoryStorage`) parsea el
// multipart y valida tipo/tamaño antes del controller.
configuracionEmpresaRouter.post(
  "/configuracion-empresa/logo",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  uploadLogoMiddleware,
  postConfiguracionEmpresaLogo,
);
