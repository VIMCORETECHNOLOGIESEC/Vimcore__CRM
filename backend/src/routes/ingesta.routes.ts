import { Router } from "express";
import { postIngestaGenerica } from "../controllers/ingesta.controller.js";
import { requireBridgeKey } from "../middlewares/require-bridge-key.middleware.js";

export const ingestaRouter = Router();

// docs/05-bridges.md §5: mismo endpoint genérico sirve a Google Forms hoy y
// a otros bridges de este estilo a futuro sin trabajo adicional (DD4).
ingestaRouter.post("/ingesta/generico", requireBridgeKey, postIngestaGenerica);
