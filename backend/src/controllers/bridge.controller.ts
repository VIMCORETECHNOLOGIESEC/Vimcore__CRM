import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import {
  bridgeCuentaParamsSchema,
  createBridgeBodySchema,
  createCuentaPublicitariaBodySchema,
  idParamSchema,
  logsQuerySchema,
  updateBridgeBodySchema,
  updateCuentaPublicitariaBodySchema,
} from "../schemas/bridges.schema.js";
import {
  createBridge,
  deleteBridge,
  getBridgeById,
  listarLogs,
  listBridges,
  redesActivas,
  redesSoportadas,
  regenerarClave,
  updateBridge,
} from "../services/bridge.service.js";
import * as cuentaPublicitariaService from "../services/cuenta-publicitaria.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "El cuerpo de la petición es inválido");
}

function invalidIdParam(): AppError {
  return new AppError("validacion_invalida", 400, "El identificador de bridge es inválido");
}

function invalidCuentaParams(): AppError {
  return new AppError("validacion_invalida", 400, "Los identificadores de bridge/cuenta son inválidos");
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

/** `GET /bridges/catalogo/redes-soportadas`: catálogo de redes derivado del enum, sin duplicados (Requirement: Network catalogs are enum-derived and deduplicated). */
export async function getRedesSoportadas(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ redesSociales: redesSoportadas() });
}

/** `GET /bridges/redes-activas`: redes con al menos un bridge no eliminado, sin duplicados (Requirement: Network catalogs are enum-derived and deduplicated). */
export async function getRedesActivas(_req: Request, res: Response): Promise<void> {
  const redesSociales = await redesActivas();
  res.status(200).json({ redesSociales });
}

/** `GET /bridges/:id/logs`: lectura acotada de la bitácora, con tope aplicado en el servidor (Requirement: Log reads are bounded by a server-side default cap). */
export async function getBridgeLogs(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const parsedQuery = logsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    throw zodValidationError();
  }

  const logs = await listarLogs(parsedId.data.id, parsedQuery.data);
  res.status(200).json({ logs });
}

/** `POST /bridges/:id/cuentas`: alta manual de una cuenta publicitaria por el administrador (Requirement: Admin can manually create a CuentaPublicitaria). */
export async function postCuentaPublicitaria(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const parsedBody = createCuentaPublicitariaBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    throw zodValidationError();
  }

  const cuenta = await cuentaPublicitariaService.create(parsedId.data.id, parsedBody.data);
  res.status(201).json({ cuenta });
}

/** `GET /bridges/:id/cuentas`: listado de cuentas publicitarias del bridge (Requirement: Bridge detail embeds its accounts). */
export async function getCuentasPublicitarias(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const cuentas = await cuentaPublicitariaService.listByBridge(parsedId.data.id);
  res.status(200).json({ cuentas });
}

/** `PATCH /bridges/:id/cuentas/:cuentaId`: solo alterna la activación de la cuenta (Requirement: PATCH toggles only activation). */
export async function patchCuentaPublicitaria(req: Request, res: Response): Promise<void> {
  const parsedParams = bridgeCuentaParamsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    throw invalidCuentaParams();
  }

  const parsedBody = updateCuentaPublicitariaBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    throw zodValidationError();
  }

  const cuenta = await cuentaPublicitariaService.toggleActiva(
    parsedParams.data.id,
    parsedParams.data.cuentaId,
    parsedBody.data.activa,
  );
  res.status(200).json({ cuenta });
}
