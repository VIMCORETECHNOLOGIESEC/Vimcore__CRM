import { Router } from "express";
import {
  getConversacionMensajes,
  getConversaciones,
  postConversacionLeido,
  postConversacionMensaje,
} from "../../controllers/whatsappMessages/conversaciones.controller.js";
import {
  getWhatsAppCallback,
  getWhatsAppConectar,
  getWhatsAppConexionStatus,
  postWhatsAppConexion,
} from "../../controllers/whatsappMessages/whatsapp-oauth.controller.js";
import {
  getWebhookWhatsAppHandshake,
  postWebhookWhatsApp,
} from "../../controllers/whatsappMessages/whatsapp-webhook.controller.js";
import { requireAuthentication } from "../../middlewares/require-authentication.middleware.js";
import { requireRole } from "../../middlewares/require-role.middleware.js";

export const whatsappRouter = Router();

// OAuth "Conectá tu WhatsApp" (rule 4, un solo número por empresa).
whatsappRouter.get(
  "/whatsapp/conectar",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getWhatsAppConectar,
);
// Sin `requireAuthentication` — Meta redirige acá el navegador del
// administrador, mismo criterio que `linkedin.routes.ts::
// getLinkedInOAuthCallback`. La identidad se recupera del `state` consumido.
whatsappRouter.get("/whatsapp/callback", getWhatsAppCallback);
whatsappRouter.post(
  "/whatsapp/conexion",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  postWhatsAppConexion,
);
whatsappRouter.get(
  "/whatsapp/conexion",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getWhatsAppConexionStatus,
);

// Webhook de mensajería entrante — se autentica por firma de la app de Meta
// (`X-Hub-Signature-256`) y, para el handshake, por `hub.verify_token`,
// nunca por `requireAuthentication`/`requireBridgeKey` (mismo criterio que
// `ingesta.routes.ts` para el webhook de leadgen).
whatsappRouter.get("/webhooks/whatsapp", getWebhookWhatsAppHandshake);
whatsappRouter.post("/webhooks/whatsapp", postWebhookWhatsApp);

// Conversaciones — RBAC por recurso (`conversaciones.access.ts`), no por
// rol fijo, mismo criterio que `leads.routes.ts::GET /leads`.
whatsappRouter.get("/conversaciones", requireAuthentication, getConversaciones);
whatsappRouter.get(
  "/conversaciones/:id/mensajes",
  requireAuthentication,
  getConversacionMensajes,
);
whatsappRouter.post(
  "/conversaciones/:id/mensajes",
  requireAuthentication,
  postConversacionMensaje,
);
// D-mensajería (leído/no leído): misma titularidad que ver/responder, RBAC
// por recurso vía `canView` dentro del servicio.
whatsappRouter.post(
  "/conversaciones/:id/leido",
  requireAuthentication,
  postConversacionLeido,
);
