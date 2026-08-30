import { Router } from "express";
import { getMarcaPublica } from "../controllers/marca-publica.controller.js";
import { marcaPublicaRateLimit } from "../middlewares/marca-publica-rate-limit.middleware.js";

export const marcaPublicaRouter = Router();

/**
 * PASO 5 (tema-empresarial-integracion): endpoint público (sin
 * `requireAuthentication`) para el boot de la SPA y la pantalla de login --
 * ninguno de los dos tiene sesión todavía, así que no pueden usar
 * `GET /configuracion-empresa` (requiere auth). Separado a propósito de esa
 * ruta administrativa -- ver `marca-publica.controller.ts`.
 */
marcaPublicaRouter.get("/marca-publica", marcaPublicaRateLimit, getMarcaPublica);
