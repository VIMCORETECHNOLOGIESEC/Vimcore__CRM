import type { Request, Response } from "express";
import { AppError } from "../../lib/app-error.js";
import { assertAuthenticated } from "../../lib/assert-authenticated.js";
import {
  metaAdsConexionBodySchema,
  metaAdsOAuthCallbackQuerySchema,
  metaAdsOAuthStartQuerySchema,
} from "../../schemas/metaAds/meta-ads-oauth.schema.js";
import {
  completeMetaAdsOAuthCallback,
  createMetaAdsConexion,
  getMetaAdsConexion,
  startMetaAdsOAuth,
} from "../../services/metaAds/meta-ads-oauth.service.js";

function invalidQuery(): AppError {
  return new AppError("validacion_invalida", 400, "La petición es inválida");
}

export async function getMetaAdsConectar(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const parsed = metaAdsOAuthStartQuerySchema.safeParse(req.query);
  if (!parsed.success) throw invalidQuery();

  const empresaId = usuario.empresaId ?? parsed.data.empresaId;
  if (!empresaId) throw new AppError("meta_ads_empresa_requerida", 400, "Debes indicar la empresa destino");

  const resultado = await startMetaAdsOAuth(empresaId, usuario.id);
  res.status(200).json(resultado);
}

export async function getMetaAdsCallback(req: Request, res: Response): Promise<void> {
  const parsed = metaAdsOAuthCallbackQuerySchema.safeParse(req.query);
  if (!parsed.success) throw invalidQuery();

  const resultado = await completeMetaAdsOAuthCallback(parsed.data);
  res.status(200).json(resultado);
}

export async function postMetaAdsConexion(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const parsed = metaAdsConexionBodySchema.safeParse(req.body);
  if (!parsed.success) throw invalidQuery();

  const conexion = await createMetaAdsConexion(usuario, parsed.data);
  res.status(200).json({ conexion });
}

export async function getMetaAdsConexionStatus(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const parsed = metaAdsOAuthStartQuerySchema.safeParse(req.query);
  if (!parsed.success) throw invalidQuery();

  const empresaId = usuario.empresaId ?? parsed.data.empresaId;
  if (!empresaId) throw new AppError("meta_ads_empresa_requerida", 400, "Debes indicar la empresa destino");

  const conexion = await getMetaAdsConexion(empresaId);
  res.status(200).json({ conexion });
}
