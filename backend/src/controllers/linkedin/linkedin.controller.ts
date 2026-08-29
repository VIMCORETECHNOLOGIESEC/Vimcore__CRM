import type { Request, Response } from "express";
import { AppError } from "../../lib/app-error.js";
import { assertAuthenticated } from "../../lib/assert-authenticated.js";
import {
  linkedinOAuthCallbackQuerySchema,
  linkedinOAuthStartParamsSchema,
} from "../../schemas/linkedin/linkedin-oauth.schema.js";
import {
  linkedinFuenteParamsSchema,
  linkedinFuentesParamsSchema as linkedinFuentesBridgeParamsSchema,
  updateLinkedInFuenteBodySchema,
} from "../../schemas/linkedin/linkedin-bridge.schema.js";
import { getLinkedInConexion as findLinkedInConexion, listLinkedInFuentes } from "../../services/linkedin/linkedin-conexion.service.js";
import { probarConexionLinkedIn } from "../../services/linkedin/linkedin-probar-conexion.service.js";
import { descubrirFuentesLinkedIn } from "../../services/linkedin/linkedin-discovery.service.js";
import { actualizarActivacionLinkedInFuente } from "../../services/linkedin/linkedin-subscription.service.js";
import {
  completeLinkedInOAuth,
  startLinkedInOAuth,
} from "../../services/linkedin/linkedin-oauth.service.js";

function invalidBridgeId(): AppError {
  return new AppError("validacion_invalida", 400, "El identificador de bridge es inválido");
}

function invalidFuenteParams(): AppError {
  return new AppError(
    "validacion_invalida",
    400,
    "El identificador de bridge o de fuente LinkedIn es inválido",
  );
}

function invalidActivacionBody(): AppError {
  return new AppError(
    "validacion_invalida",
    400,
    "El cuerpo de activación de la fuente LinkedIn es inválido",
  );
}

function invalidCallbackQuery(): AppError {
  return new AppError(
    "validacion_invalida",
    400,
    "Los parámetros del callback de LinkedIn son inválidos",
  );
}

export async function postLinkedInOAuthStart(req: Request, res: Response): Promise<void> {
  const user = assertAuthenticated(req);
  const parsedParams = linkedinOAuthStartParamsSchema.safeParse(req.params);
  if (!parsedParams.success) throw invalidBridgeId();

  const result = await startLinkedInOAuth(parsedParams.data.id, user.id);
  res.status(200).json(result);
}

export async function getLinkedInConexion(req: Request, res: Response): Promise<void> {
  const parsedParams = linkedinOAuthStartParamsSchema.safeParse(req.params);
  if (!parsedParams.success) throw invalidBridgeId();

  const conexion = await findLinkedInConexion(parsedParams.data.id);
  res.status(200).json({ conexion });
}

export async function postLinkedInProbarConexion(req: Request, res: Response): Promise<void> {
  const parsedParams = linkedinOAuthStartParamsSchema.safeParse(req.params);
  if (!parsedParams.success) throw invalidBridgeId();

  const resultado = await probarConexionLinkedIn(parsedParams.data.id);
  res.status(200).json(resultado);
}

export async function getLinkedInFuentes(req: Request, res: Response): Promise<void> {
  const parsedParams = linkedinFuentesBridgeParamsSchema.safeParse(req.params);
  if (!parsedParams.success) throw invalidBridgeId();

  const fuentes = await listLinkedInFuentes(parsedParams.data.id);
  res.status(200).json({ fuentes });
}

export async function postLinkedInDescubrirFuentes(req: Request, res: Response): Promise<void> {
  const parsedParams = linkedinFuentesBridgeParamsSchema.safeParse(req.params);
  if (!parsedParams.success) throw invalidBridgeId();

  const resultado = await descubrirFuentesLinkedIn(parsedParams.data.id);
  res.status(200).json(resultado);
}

export async function patchLinkedInFuente(req: Request, res: Response): Promise<void> {
  const parsedParams = linkedinFuenteParamsSchema.safeParse(req.params);
  if (!parsedParams.success) throw invalidFuenteParams();

  const parsedBody = updateLinkedInFuenteBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw invalidActivacionBody();

  const fuente = await actualizarActivacionLinkedInFuente(
    parsedParams.data.id,
    parsedParams.data.fuenteId,
    parsedBody.data.activa,
  );
  res.status(200).json({ fuente });
}

export async function getLinkedInOAuthCallback(req: Request, res: Response): Promise<void> {
  if (Object.prototype.hasOwnProperty.call(req.query, "returnTo")) {
    throw invalidCallbackQuery();
  }

  const parsedQuery = linkedinOAuthCallbackQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) throw invalidCallbackQuery();

  const conexion = await completeLinkedInOAuth(parsedQuery.data);
  res.status(200).json({ conexion });
}
