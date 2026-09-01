import type { RolUsuario } from "@prisma/client";
import { eventBroker } from "../lib/event-broker.js";
import { logger } from "../lib/logger.js";
import { runWithTenantContext } from "../lib/prisma.js";
import * as notificacionRepository from "../repositories/notificacion.repository.js";
import type { AuthenticatedUser } from "../types/authenticated-user.js";

export type EstadoPresencia = "online" | "offline";

export interface PresenciaUsuarioView {
  estado: EstadoPresencia;
  conectadoDesde: string | null;
  ultimaSenalEn: string | null;
  desconectadoEn: string | null;
  conexionesActivas: number;
}

export interface PresenciaCambiadaEvent extends PresenciaUsuarioView {
  usuarioId: string;
  empresaId: string;
}

interface PresenciaRecord {
  usuarioId: string;
  empresaId: string;
  conectadoDesde: Date | null;
  ultimaSenalEn: Date | null;
  desconectadoEn: Date | null;
  conexionesActivas: number;
}

const ROLES_NOTIFICADOS_PRESENCIA: readonly RolUsuario[] = ["ADMINISTRADOR", "SUPERVISOR"];
const records = new Map<string, PresenciaRecord>();

function keyFor(usuarioId: string, empresaId: string): string {
  return `${usuarioId}\u0000${empresaId}`;
}

function emptyPresence(): PresenciaUsuarioView {
  return {
    estado: "offline",
    conectadoDesde: null,
    ultimaSenalEn: null,
    desconectadoEn: null,
    conexionesActivas: 0,
  };
}

function toView(record: PresenciaRecord | undefined): PresenciaUsuarioView {
  if (!record) return emptyPresence();
  return {
    estado: record.conexionesActivas > 0 ? "online" : "offline",
    conectadoDesde: record.conectadoDesde?.toISOString() ?? null,
    ultimaSenalEn: record.ultimaSenalEn?.toISOString() ?? null,
    desconectadoEn: record.desconectadoEn?.toISOString() ?? null,
    conexionesActivas: record.conexionesActivas,
  };
}

function toEvent(record: PresenciaRecord): PresenciaCambiadaEvent {
  return {
    usuarioId: record.usuarioId,
    empresaId: record.empresaId,
    ...toView(record),
  };
}

async function publishPresenceChanged(record: PresenciaRecord): Promise<void> {
  const recipients = await runWithTenantContext(
    { empresaId: record.empresaId },
    () => notificacionRepository.findActiveRecipientIds(
      ROLES_NOTIFICADOS_PRESENCIA,
      record.empresaId,
    ),
  );
  const payload = toEvent(record);
  for (const recipientId of new Set([...recipients, record.usuarioId])) {
    eventBroker.publish(recipientId, "usuario.presencia-cambiada", payload, record.empresaId);
  }
}

function notifyPresenceChanged(record: PresenciaRecord): void {
  void publishPresenceChanged(record).catch((err: unknown) => {
    logger.error(
      { err, usuarioId: record.usuarioId, empresaId: record.empresaId },
      "presencia: fallo al publicar cambio de estado",
    );
  });
}

export function registerPresenceConnection(
  user: Pick<AuthenticatedUser, "id" | "empresaId">,
  now: Date = new Date(),
  options: { publish?: boolean } = {},
): { touch: (at?: Date) => void; close: (at?: Date) => void } {
  if (user.empresaId === null) {
    return { touch: () => undefined, close: () => undefined };
  }

  const key = keyFor(user.id, user.empresaId);
  const record = records.get(key) ?? {
    usuarioId: user.id,
    empresaId: user.empresaId,
    conectadoDesde: null,
    ultimaSenalEn: null,
    desconectadoEn: null,
    conexionesActivas: 0,
  };

  const wasOffline = record.conexionesActivas === 0;
  record.conexionesActivas += 1;
  record.ultimaSenalEn = now;
  if (wasOffline) {
    record.conectadoDesde = now;
    record.desconectadoEn = null;
  }
  records.set(key, record);
  const shouldPublish = options.publish ?? true;
  if (wasOffline && shouldPublish) notifyPresenceChanged(record);

  let closed = false;
  return {
    touch: (at: Date = new Date()) => {
      if (closed) return;
      record.ultimaSenalEn = at;
    },
    close: (at: Date = new Date()) => {
      if (closed) return;
      closed = true;
      record.conexionesActivas = Math.max(0, record.conexionesActivas - 1);
      record.ultimaSenalEn = at;
      if (record.conexionesActivas === 0) {
        record.conectadoDesde = null;
        record.desconectadoEn = at;
        if (shouldPublish) notifyPresenceChanged(record);
      }
    },
  };
}

export function getPresenceForUsuarios(
  usuarioIds: readonly string[],
  empresaId?: string,
): Map<string, PresenciaUsuarioView> {
  const result = new Map<string, PresenciaUsuarioView>();
  for (const usuarioId of usuarioIds) {
    if (empresaId) {
      result.set(usuarioId, toView(records.get(keyFor(usuarioId, empresaId))));
      continue;
    }

    const userRecords = [...records.values()].filter((record) => record.usuarioId === usuarioId);
    const online = userRecords.find((record) => record.conexionesActivas > 0);
    if (online) {
      result.set(usuarioId, toView(online));
      continue;
    }
    const latestOffline = userRecords.reduce<PresenciaRecord | undefined>((latest, current) => {
      if (!latest) return current;
      return (current.desconectadoEn?.getTime() ?? 0) > (latest.desconectadoEn?.getTime() ?? 0)
        ? current
        : latest;
    }, undefined);
    result.set(usuarioId, toView(latestOffline));
  }
  return result;
}

export function __resetPresenceForTests(): void {
  records.clear();
}
