import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { compareClaveBridge, hashClaveBridge } from "../lib/clave-bridge.js";
import { logger } from "../lib/logger.js";
import * as bridgeLogRepository from "../repositories/bridge-log.repository.js";
import * as bridgeRepository from "../repositories/bridge.repository.js";

function bridgeNoAutenticado(mensaje: string): AppError {
  return new AppError("bridge_no_autenticado", 401, mensaje);
}

/**
 * DD4 (diseño M4): autenticación de bridges vía `X-Bridge-Key`
 * (docs/05-bridges.md §5/§7), siguiendo el precedente de
 * `require-authentication.middleware.ts`. Corre enteramente ANTES de que
 * exista cualquier transacción de ingesta, así que su log ERROR
 * (Requirement: Bridge authentication) queda trivialmente fuera de ella
 * (DD5) — nunca hay que revertir nada. `ingesta.service.ts` (PR3a) no
 * repite ningún control de autenticación.
 *
 * Un bridge encontrado por `findByClaveApiHash` ya coincidió por igualdad
 * exacta en el índice único de la BD; `compareClaveBridge` (DD4) añade la
 * comparación en tiempo constante como control explícito y auditable sobre
 * el hash, en vez de confiar solo en la semántica del índice.
 */
export async function requireBridgeKey(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const claveApi = req.header("X-Bridge-Key")?.trim();

  if (!claveApi) {
    await registrarRechazo(null, "Falta el encabezado X-Bridge-Key");
    next(bridgeNoAutenticado("Falta el encabezado X-Bridge-Key"));
    return;
  }

  const hash = hashClaveBridge(claveApi);
  const bridge = await bridgeRepository.findByClaveApiHash(hash);
  const mensajeInvalido = "X-Bridge-Key inválida o bridge inactivo";

  if (!bridge || bridge.estado !== "ACTIVO" || !compareClaveBridge(hash, bridge.claveApiHash)) {
    await registrarRechazo(bridge?.id ?? null, mensajeInvalido);
    next(bridgeNoAutenticado(mensajeInvalido));
    return;
  }

  req.bridge = { id: bridge.id, redSocial: bridge.redSocial };
  next();
}

async function registrarRechazo(bridgeId: string | null, mensaje: string): Promise<void> {
  try {
    await bridgeLogRepository.registrarLog({ bridgeId, nivel: "ERROR", mensaje });
  } catch (error) {
    logger.error({ err: error, bridgeId }, "requireBridgeKey: fallo al registrar bridge_logs");
  }
}
