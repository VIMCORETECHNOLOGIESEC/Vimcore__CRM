import type { Prisma, RolUsuario, TipoNotificacion } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";
import * as notificationRepository from "../repositories/notificacion.repository.js";
export interface NotificationInput {
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  leadId?: string | null;
}
const UNASSIGNED_RECIPIENT_ROLES: readonly RolUsuario[] = ["SUPERVISOR", "ADMINISTRADOR"];
export async function createForActiveRoles(
  roles: readonly RolUsuario[],
  input: NotificationInput,
  client: PrismaClientOrTransaction = prisma,
) {
  const recipientIds = await notificationRepository.findActiveRecipientIds(roles, client);
  const created = [];
  for (const usuarioId of recipientIds) {
    created.push(await notificationRepository.createNotificacion({ usuarioId, ...input }, client));
  }
  return created;
}
export async function listNotifications(usuarioId: string, soloNoLeidas: boolean) {
  return notificationRepository.listByUsuario(usuarioId, soloNoLeidas);
}
export async function markNotificationRead(id: string, usuarioId: string): Promise<void> {
  const found = await notificationRepository.markOneRead(id, usuarioId, new Date());
  if (!found) {
    throw new AppError("notificacion_no_encontrada", 404, "Notificación no encontrada");
  }
}
export async function markAllNotificationsRead(usuarioId: string): Promise<void> {
  await notificationRepository.markAllRead(usuarioId, new Date());
}
export async function createForActiveSupervisorsAndAdmins(
  input: NotificationInput,
  client: PrismaClientOrTransaction = prisma,
) {
  const recipientIds = await notificationRepository.findActiveRecipientIds(
    UNASSIGNED_RECIPIENT_ROLES,
    client,
  );
  const created = [];
  for (const usuarioId of recipientIds) {
    created.push(await notificationRepository.createNotificacion({ usuarioId, ...input }, client));
  }
  return created;
}
