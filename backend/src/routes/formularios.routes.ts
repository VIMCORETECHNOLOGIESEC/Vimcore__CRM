import { Router } from "express";
import { getFormularioEtapa } from "../controllers/formularios.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";

export const formulariosRouter = Router();

formulariosRouter.get("/formularios/:etapa", requireAuthentication, getFormularioEtapa);
