import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { ingestaRouter } from "./ingesta.routes.js";
import { healthRouter } from "./salud.routes.js";
import { usuariosRouter } from "./usuarios.routes.js";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(usuariosRouter);
apiRouter.use(ingestaRouter);
