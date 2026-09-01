import type { Request, Response } from "express";
import { AppError } from "../../lib/app-error.js";
import { assertAuthenticated } from "../../lib/assert-authenticated.js";
import {
  conversacionIdParamSchema,
  listConversacionesQuerySchema,
  listMensajesQuerySchema,
  postMensajeBodySchema,
} from "../../schemas/whatsappMessages/conversaciones.schema.js";
import {
  getMensajes,
  listConversaciones,
  marcarConversacionLeida,
  postMensaje,
} from "../../services/whatsappMessages/conversaciones.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "La petición es inválida");
}

/** `GET /conversaciones` — listado scopeado por RBAC (ver `conversaciones.service.ts::listConversaciones`). */
export async function getConversaciones(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const parsed = listConversacionesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw zodValidationError();

  const resultado = await listConversaciones(usuario, parsed.data);
  res.status(200).json(resultado);
}

/** `GET /conversaciones/:id/mensajes` — historial paginado. */
export async function getConversacionMensajes(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const parsedId = conversacionIdParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();
  const parsedQuery = listMensajesQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) throw zodValidationError();

  const resultado = await getMensajes(usuario, parsedId.data.id, parsedQuery.data);
  res.status(200).json(resultado);
}

/** `POST /conversaciones/:id/mensajes` — el asesor responde vía WhatsApp Cloud API. */
export async function postConversacionMensaje(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const parsedId = conversacionIdParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();
  const parsedBody = postMensajeBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const mensaje = await postMensaje(usuario, parsedId.data.id, parsedBody.data);
  res.status(201).json({ mensaje });
}

/** `POST /conversaciones/:id/leido` — marca la conversación como leída para el usuario actual. */
export async function postConversacionLeido(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const parsedId = conversacionIdParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  await marcarConversacionLeida(usuario, parsedId.data.id);
  res.status(204).send();
}
