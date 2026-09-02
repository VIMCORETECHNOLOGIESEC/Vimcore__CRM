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
// Fix (bug de seguridad: chat de WhatsApp invisible para todo rol que no
// fuera ADMINISTRADOR): esta ruta es una LECTURA de estado ("¿está
// conectado el WhatsApp de mi empresa?"), no la acción de conectar —
// `frontend/.../LeadDetallePage.tsx` la consume desde el panel de chat que
// ve cualquier rol al trabajar un lead (asesor, vendedor, supervisor), no
// solo el administrador. `requireRole("ADMINISTRADOR")` acá hacía que un
// asesor SIEMPRE viera "no conectado" aunque la empresa sí tuviera WhatsApp
// activo. El aislamiento por empresa sigue garantizado independientemente
// del rol: `getWhatsAppConexionStatus` resuelve `empresaId` con
// `usuario.empresaId ?? parsed.data.empresaId`, así que una sesión
// company-scoped nunca puede sobreescribirlo vía query param (mismo
// criterio D9/D10 que `createWhatsAppConexion`); solo una sesión
// holding-wide, que ya requiere ADMINISTRADOR/SUPERVISOR/SUPERVISOR_HOLDING
// para existir, cae al query param. El DTO tampoco expone ningún token
// (`WhatsAppConexionDto`: id/empresaId/numeroTelefonoId/numeroDisplay/
// wabaId/estado/creadoEn). `whatsapp/conectar` y `POST /whatsapp/conexion`
// siguen admin-only: esas sí son la acción real de conectar.
whatsappRouter.get(
  "/whatsapp/conexion",
  requireAuthentication,
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
