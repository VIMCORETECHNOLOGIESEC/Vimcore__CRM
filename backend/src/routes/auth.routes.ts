import { Router } from "express";
import { getPerfil, postLogin, postLogout, postRefresh } from "../controllers/auth.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";

export const authRouter = Router();

authRouter.post("/auth/login", postLogin);
authRouter.post("/auth/refresh", postRefresh);
authRouter.post("/auth/logout", requireAuthentication, postLogout);
authRouter.get("/auth/perfil", requireAuthentication, getPerfil);
