import type { RolUsuario } from "@prisma/client";
import { ASIGNACION_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import * as bridgeLogRepository from "../repositories/bridge-log.repository.js";
import { notificationEvents, publishCommittedEvents } from "./committed-events.service.js";
import { createForActiveRoles } from "./notificaciones.service.js";

const ADMIN_ROLES: readonly RolUsuario[] = ["ADMINISTRADOR"];

export async function registrarBridgeLog(data: bridgeLogRepository.RegistrarLogData) {
  if (data.nivel !== "ERROR") return bridgeLogRepository.registrarLog(data);
  const committed = await runInTransaction(undefined, async (tx) => {
    const log = await bridgeLogRepository.registrarLog(data, tx);
    const notifications = await createForActiveRoles(ADMIN_ROLES, { tipo: "ERROR_BRIDGE", titulo: "Error de bridge", mensaje: data.mensaje }, tx);
    return { log, events: notifications.flatMap(notificationEvents) };
  }, ASIGNACION_TRANSACTION_BOUNDS);
  publishCommittedEvents(committed.events);
  return committed.log;
}
