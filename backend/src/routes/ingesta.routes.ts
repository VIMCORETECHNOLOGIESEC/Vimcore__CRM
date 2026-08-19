import { Router } from "express";
import { postIngestaGenerica } from "../controllers/ingesta.controller.js";
import { getIngestaMetaHandshake, postIngestaMeta } from "../controllers/meta-webhook.controller.js";
import { requireBridgeKey } from "../middlewares/require-bridge-key.middleware.js";

export const ingestaRouter = Router();

// docs/05-bridges.md §5: mismo endpoint genérico sirve a Google Forms hoy y
// a otros bridges de este estilo a futuro sin trabajo adicional (DD4).
ingestaRouter.post("/ingesta/generico", requireBridgeKey, postIngestaGenerica);

// docs/05-bridges.md §3: el webhook de Meta NO usa `X-Bridge-Key`
// (`requireBridgeKey`) — se autentica con `X-Hub-Signature-256` (adaptador
// Meta, verificado dentro del controller contra `req.rawBody`) y, para el
// handshake `GET`, con `hub.verify_token` contra `META_WEBHOOK_VERIFY_TOKEN`.
ingestaRouter.get("/ingesta/meta", getIngestaMetaHandshake);
ingestaRouter.post("/ingesta/meta", postIngestaMeta);
