import { Router } from "express";
import { getHealth } from "../controllers/salud.controller.js";

export const healthRouter = Router();

healthRouter.get("/salud", getHealth);
