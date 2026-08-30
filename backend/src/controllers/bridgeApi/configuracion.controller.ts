import type { Request, Response } from "express";
import { AppError } from "../../lib/app-error.js";
import { conexionBridgeApiBodySchema, idParamSchema, mapeoBridgeApiBodySchema } from "../../schemas/bridges.schema.js";
import { actualizarConexion, actualizarMapeo, probarConexion } from "../../services/bridgeApi/configuracion.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "El cuerpo de la petición es inválido");
}

function invalidIdParam(): AppError {
  return new AppError("validacion_invalida", 400, "El identificador de bridge es inválido");
}

/** `PATCH /bridges/:id/api-externa/conexion`: carga o corrige url/credencial/header del bridge API_EXTERNA. */
export async function patchBridgeApiConexion(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const parsedBody = conexionBridgeApiBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    throw zodValidationError();
  }

  const bridgeApiConfig = await actualizarConexion(parsedId.data.id, parsedBody.data);
  res.status(200).json({ bridgeApiConfig });
}

/** `PATCH /bridges/:id/api-externa/mapeo`: carga o corrige mapeoCampos/parametroFecha del bridge API_EXTERNA. */
export async function patchBridgeApiMapeo(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const parsedBody = mapeoBridgeApiBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    throw zodValidationError();
  }

  const bridgeApiConfig = await actualizarMapeo(parsedId.data.id, parsedBody.data);
  res.status(200).json({ bridgeApiConfig });
}

/**
 * `POST /bridges/:id/api-externa/probar-conexion`: diagnóstico bajo demanda,
 * mismo criterio que `postCuentaProbarConexion` -- nunca falla con 500 por
 * un problema de la API externa, siempre devuelve `{ ok, mensaje }` con 200.
 */
export async function postBridgeApiProbarConexion(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const resultado = await probarConexion(parsedId.data.id);
  res.status(200).json(resultado);
}
