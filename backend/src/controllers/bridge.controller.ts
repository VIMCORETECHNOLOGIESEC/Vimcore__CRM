import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { createBridgeBodySchema, idParamSchema, updateBridgeBodySchema } from "../schemas/bridges.schema.js";
import {
  createBridge,
  deleteBridge,
  getBridgeById,
  listBridges,
  regenerarClave,
  updateBridge,
} from "../services/bridge.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "El cuerpo de la petición es inválido");
}

function invalidIdParam(): AppError {
  return new AppError("validacion_invalida", 400, "El identificador de bridge es inválido");
}

export async function getBridges(_req: Request, res: Response): Promise<void> {
  const bridges = await listBridges();
  res.status(200).json({ bridges });
}

export async function postBridge(req: Request, res: Response): Promise<void> {
  const parsed = createBridgeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw zodValidationError();
  }

  const { bridge, claveApi } = await createBridge(parsed.data);
  res.status(201).json({ bridge, claveApi });
}

export async function getBridge(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const bridge = await getBridgeById(parsedId.data.id);
  res.status(200).json({ bridge });
}

export async function patchBridge(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const parsedBody = updateBridgeBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    throw zodValidationError();
  }

  const bridge = await updateBridge(parsedId.data.id, parsedBody.data);
  res.status(200).json({ bridge });
}

export async function deleteBridgeHandler(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const { resultado, bridge } = await deleteBridge(parsedId.data.id);
  res.status(200).json({ resultado, bridge });
}

export async function postBridgeClave(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const { bridge, claveApi } = await regenerarClave(parsedId.data.id);
  res.status(200).json({ bridge, claveApi });
}
