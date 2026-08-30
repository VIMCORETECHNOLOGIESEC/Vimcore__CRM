import type { RolUsuario } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { ASIGNACION_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import * as bridgeLogRepository from "../repositories/bridge-log.repository.js";
import * as bridgeRepository from "../repositories/bridge.repository.js";
import { notificationEvents, publishCommittedEvents } from "./committed-events.service.js";
import { createForActiveRoles, createHoldingForActiveRoles } from "./notificaciones.service.js";

const ADMIN_ROLES: readonly RolUsuario[] = ["ADMINISTRADOR"];

export async function registrarBridgeLog(data: bridgeLogRepository.RegistrarLogData) {
  const committed = await runInTransaction(undefined, async (tx) => {
    const bridge = data.bridgeId ? await bridgeRepository.findById(data.bridgeId, tx) : null;
    if (data.bridgeId && !bridge) {
      throw new AppError("contexto_empresa_no_resuelto", 422, "No se pudo resolver la empresa del bridge");
    }
    const empresaId = bridge?.empresaId ?? data.empresaId ?? null;
    if (!data.bridgeId && !data.empresaId && data.holdingWide !== true) {
      throw new AppError("contexto_empresa_no_resuelto", 422, "El log requiere una empresa o alcance holding explícito");
    }
    const log = await bridgeLogRepository.registrarLog({ ...data, empresaId }, tx);
    if (data.nivel !== "ERROR") return { log, events: [] };
    const input = { tipo: "ERROR_BRIDGE" as const, titulo: "Error de bridge", mensaje: data.mensaje };
    const notifications = empresaId
      ? await createForActiveRoles(ADMIN_ROLES, input, empresaId, tx)
      : await createHoldingForActiveRoles(ADMIN_ROLES, input, tx);
    return { log, events: notifications.flatMap(notificationEvents) };
  }, ASIGNACION_TRANSACTION_BOUNDS);
  publishCommittedEvents(committed.events);
  return committed.log;
}
