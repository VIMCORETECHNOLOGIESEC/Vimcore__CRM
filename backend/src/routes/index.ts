import { Router } from "express";
import { healthRouter } from "./salud.routes.js";

export const apiRouter = Router();

apiRouter.use(healthRouter);
