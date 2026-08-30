import type { Request, Response } from "express";
import { AppError } from "../../lib/app-error.js";
import { assertAuthenticated } from "../../lib/assert-authenticated.js";
import {
  whatsappConexionBodySchema,
  whatsappOAuthCallbackQuerySchema,
  whatsappOAuthStartQuerySchema,
} from "../../schemas/whatsappMessages/whatsapp-oauth.schema.js";
import {
  completeWhatsAppOAuthCallback,
  createWhatsAppConexion,
  getWhatsAppConexion,
  startWhatsAppOAuth,
} from "../../services/whatsappMessages/whatsapp-oauth.service.js";

function invalidQuery(): AppError {
  return new AppError("validacion_invalida", 400, "La petición es inválida");
}

/**
 * `GET /whatsapp/conectar` (ADMINISTRADOR): redirige a Meta OAuth con
 * `state`. rule 4: solo un actor holding-wide (`usuario.empresaId === null`,
 * mismo criterio que ADMINISTRADOR/SUPERVISOR en el resto del sistema) puede
 * elegir la empresa destino vía `?empresaId=`; el resto siempre usa la suya.
 */
export async function getWhatsAppConectar(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const parsed = whatsappOAuthStartQuerySchema.safeParse(req.query);
  if (!parsed.success) throw invalidQuery();

  const empresaId = usuario.empresaId ?? parsed.data.empresaId;
  if (!empresaId) {
    throw new AppError("whatsapp_empresa_requerida", 400, "Debes indicar la empresa destino");
  }

  const resultado = await startWhatsAppOAuth(empresaId, usuario.id);
  res.status(200).json(resultado);
}

/**
 * `GET /whatsapp/callback` — sin `requireAuthentication` (mismo criterio que
 * `linkedin.routes.ts::getLinkedInOAuthCallback`): Meta redirige acá el
 * navegador del administrador, la identidad se recupera del `state`
 * consumido, no de un JWT. Responde la lista de números descubiertos, NUNCA
 * conecta automático.
 */
export async function getWhatsAppCallback(req: Request, res: Response): Promise<void> {
  const parsed = whatsappOAuthCallbackQuerySchema.safeParse(req.query);
  if (!parsed.success) throw invalidQuery();

  const resultado = await completeWhatsAppOAuthCallback(parsed.data);
  res.status(200).json(resultado);
}

/** `POST /whatsapp/conexion` (ADMINISTRADOR): recibe el número elegido, cifra y persiste `WhatsAppConexion`. */
export async function postWhatsAppConexion(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const parsed = whatsappConexionBodySchema.safeParse(req.body);
  if (!parsed.success) throw invalidQuery();

  const conexion = await createWhatsAppConexion(usuario, parsed.data);
  res.status(200).json({ conexion });
}

/**
 * `GET /whatsapp/conexion` (ADMINISTRADOR): estado actual de la conexión de
 * la empresa (o `null` si nunca se conectó). Misma resolución de empresa
 * destino que `getWhatsAppConectar` (rule 4: holding-wide vía `?empresaId=`).
 */
export async function getWhatsAppConexionStatus(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const parsed = whatsappOAuthStartQuerySchema.safeParse(req.query);
  if (!parsed.success) throw invalidQuery();

  const empresaId = usuario.empresaId ?? parsed.data.empresaId;
  if (!empresaId) {
    throw new AppError("whatsapp_empresa_requerida", 400, "Debes indicar la empresa destino");
  }

  const conexion = await getWhatsAppConexion(empresaId);
  res.status(200).json({ conexion });
}
