import { Router } from "express";
import {
  getLinkedInFuentes,
  getLinkedInConexion,
  getLinkedInOAuthCallback,
  patchLinkedInFuente,
  postLinkedInDescubrirFuentes,
  postLinkedInProbarConexion,
  postLinkedInOAuthStart,
} from "../../controllers/linkedin/linkedin.controller.js";
import {
  getLinkedInWebhookHandshake,
  postLinkedInWebhook,
} from "../../controllers/linkedin/linkedin-webhook.controller.js";
import { requireAuthentication } from "../../middlewares/require-authentication.middleware.js";
import { requireRole } from "../../middlewares/require-role.middleware.js";

export const linkedinRouter = Router();

linkedinRouter.get(
  "/integraciones/linkedin/oauth/callback",
  getLinkedInOAuthCallback,
);

// Webhook de Lead Sync (docs/05-bridges.md, patrón de buzón durable):
// se autentica por challenge/`X-LI-Signature`, NUNCA por
// `requireAuthentication`/JWT — mismo criterio que Meta/WhatsApp. El path
// debe calzar byte a byte con `linkedin-subscription.service.ts::
// productionWebhookUrl()`.
linkedinRouter.get("/integraciones/linkedin/webhook", getLinkedInWebhookHandshake);
linkedinRouter.post("/integraciones/linkedin/webhook", postLinkedInWebhook);

linkedinRouter.post(
  "/bridges/:id/linkedin/oauth/iniciar",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  postLinkedInOAuthStart,
);

linkedinRouter.get(
  "/bridges/:id/linkedin/conexion",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getLinkedInConexion,
);

linkedinRouter.post(
  "/bridges/:id/linkedin/probar-conexion",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  postLinkedInProbarConexion,
);

linkedinRouter.post(
  "/bridges/:id/linkedin/fuentes/descubrir",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  postLinkedInDescubrirFuentes,
);

linkedinRouter.get(
  "/bridges/:id/linkedin/fuentes",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getLinkedInFuentes,
);

linkedinRouter.patch(
  "/bridges/:id/linkedin/fuentes/:fuenteId",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  patchLinkedInFuente,
);
