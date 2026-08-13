import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { healthRouter } from "./salud.routes.js";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
