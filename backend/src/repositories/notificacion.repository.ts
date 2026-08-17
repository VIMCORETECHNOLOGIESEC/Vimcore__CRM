import type { Notificacion, Prisma, RolUsuario, TipoNotificacion } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";
export interface CreateNotificacionData {
  usuarioId: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  leadId?: string | null;
}
export async function createNotificacion(
  data: CreateNotificacionData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Notificacion> {
  return client.notificacion.create({ data });
}
export async function listByUsuario(
  usuarioId: string,
  soloNoLeidas: boolean,
  client: PrismaClientOrTransaction = prisma,
): Promise<Notificacion[]> {
  return client.notificacion.findMany({
    where: { usuarioId, ...(soloNoLeidas ? { leidaEn: null } : {}) },
    orderBy: { creadaEn: "desc" },
  });
}
export async function markOneRead(
  id: string,
  usuarioId: string,
  leidaEn: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<boolean> {
  const result = await client.notificacion.updateMany({
    where: { id, usuarioId },
    data: { leidaEn },
  });
  return result.count === 1;
}
export async function markAllRead(
  usuarioId: string,
  leidaEn: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.notificacion.updateMany({
    where: { usuarioId, leidaEn: null },
    data: { leidaEn },
  });
}
export async function findActiveRecipientIds(
  roles: readonly RolUsuario[],
  client: PrismaClientOrTransaction = prisma,
): Promise<string[]> {
  const users = await client.usuario.findMany({
    where: { activo: true, rol: { in: [...roles] } },
    select: { id: true },
  });
  return users.map(({ id }) => id);
}
