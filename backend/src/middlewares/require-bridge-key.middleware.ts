import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { compareClaveBridge, hashClaveBridge } from "../lib/clave-bridge.js";
import { logger } from "../lib/logger.js";
import { runWithTenantContext, withBootstrapClaveApiHashGuc } from "../lib/prisma.js";
import { registrarBridgeLog } from "../services/bridge-log.service.js";
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
  // Bloque C (Etapa 3, D2 gap closure, batch 3 discovery): ver
  // `lib/prisma.ts::withBootstrapClaveApiHashGuc` — esta lectura ocurre
  // ANTES de que exista un TenantContext (es justamente lo que resuelve).
  const bridge = await withBootstrapClaveApiHashGuc(hash, (tx) =>
    bridgeRepository.findByClaveApiHash(hash, tx),
  );
  const mensajeInvalido = "X-Bridge-Key inválida o bridge inactivo";

  if (!bridge || bridge.estado !== "ACTIVO" || !compareClaveBridge(hash, bridge.claveApiHash)) {
    await registrarRechazo(bridge?.id ?? null, mensajeInvalido);
    next(bridgeNoAutenticado(mensajeInvalido));
    return;
  }

  req.bridge = { id: bridge.id, redSocial: bridge.redSocial };
  // Bloque C (Etapa 3, D2/D3, batch 3 discovery): puebla el carrier de
  // `AsyncLocalStorage` de `lib/prisma.ts` alrededor de `next()` — todo el
  // resto del ciclo de vida de esta request (ingesta, deduplicación,
  // creación de Lead/LeadEvento) corre dentro de este contexto, igual que
  // `requireAuthentication` para requests autenticadas por usuario.
  // `bridge.empresaId` es NOT NULL desde Bloque C (D4, Fase 2/Stage 2) — sin
  // esto, todo el pipeline de ingesta (Meta/Google Forms) corría hasta ahora
  // completamente sin TenantContext, así que cualquier escritura RLS
  // (`leads`, `lead_eventos`, `citas`, `notificaciones`) fallaba fail-closed.
  runWithTenantContext({ empresaId: bridge.empresaId }, next);
}

async function registrarRechazo(bridgeId: string | null, mensaje: string): Promise<void> {
  try {
    await registrarBridgeLog({ bridgeId, nivel: "ERROR", mensaje });
  } catch (error) {
    logger.error({ err: error, bridgeId }, "requireBridgeKey: fallo al registrar bridge_logs");
  }
}
