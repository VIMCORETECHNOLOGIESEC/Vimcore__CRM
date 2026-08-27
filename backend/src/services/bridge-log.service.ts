import type { RolUsuario } from "@prisma/client";
import { ASIGNACION_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import * as bridgeLogRepository from "../repositories/bridge-log.repository.js";
import * as bridgeRepository from "../repositories/bridge.repository.js";
import { notificationEvents, publishCommittedEvents } from "./committed-events.service.js";
import { createForActiveRoles } from "./notificaciones.service.js";

const ADMIN_ROLES: readonly RolUsuario[] = ["ADMINISTRADOR"];

export async function registrarBridgeLog(data: bridgeLogRepository.RegistrarLogData) {
  if (data.nivel !== "ERROR") return bridgeLogRepository.registrarLog(data);
  const committed = await runInTransaction(undefined, async (tx) => {
    const log = await bridgeLogRepository.registrarLog(data, tx);
    // Bloque C (D5): resuelve el `empresaId` del bridge que originó el error
    // ANTES de notificar — cierra el chokepoint para alertas de bridge-error
    // (spec, "closes cross-company notification leaks"). `data.bridgeId` es
    // nullable (algunos ERROR no tienen bridge conocido aún); sin bridge, se
    // degrada a holding-wide (`null`), igual que el comportamiento previo.
    const empresaId = data.bridgeId
      ? ((await bridgeRepository.findById(data.bridgeId, tx))?.empresaId ?? null)
      : null;
    const notifications = await createForActiveRoles(
      ADMIN_ROLES,
      { tipo: "ERROR_BRIDGE", titulo: "Error de bridge", mensaje: data.mensaje },
      empresaId,
      tx,
    );
    return { log, events: notifications.flatMap(notificationEvents) };
  }, ASIGNACION_TRANSACTION_BOUNDS);
  publishCommittedEvents(committed.events);
  return committed.log;
}
