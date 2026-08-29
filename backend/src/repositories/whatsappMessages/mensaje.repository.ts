import type { Mensaje, Prisma } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

export interface CreateMensajeEntranteData {
  conversacionId: string;
  idExternoMensaje: string;
  texto: string | null;
  payloadOriginal: Prisma.InputJsonValue;
  enviadoEn: Date;
}

/**
 * `@@unique([conversacionId, idExternoMensaje])` (wamid) es la idempotencia
 * contra reintentos de webhook — mismo idioma que
 * `LeadRecibido.@@unique([bridgeId, idExternoLead])`. `upsert` con `update:
 * {}` deja la fila existente intacta ante un reintento en vez de fallar con
 * P2002 (el llamador no necesita distinguir "insertado" de "ya existía").
 */
export async function upsertEntrante(
  data: CreateMensajeEntranteData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Mensaje> {
  return client.mensaje.upsert({
    where: {
      conversacionId_idExternoMensaje: {
        conversacionId: data.conversacionId,
        idExternoMensaje: data.idExternoMensaje,
      },
    },
    create: {
      conversacionId: data.conversacionId,
      direccion: "ENTRANTE",
      idExternoMensaje: data.idExternoMensaje,
      texto: data.texto,
      payloadOriginal: data.payloadOriginal,
      enviadoEn: data.enviadoEn,
    },
    update: {},
  });
}

export interface CreateMensajeSalienteData {
  conversacionId: string;
  idExternoMensaje: string;
  texto: string;
  usuarioId: string;
  enviadoEn: Date;
}

export async function createSaliente(
  data: CreateMensajeSalienteData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Mensaje> {
  return client.mensaje.create({
    data: {
      conversacionId: data.conversacionId,
      direccion: "SALIENTE",
      idExternoMensaje: data.idExternoMensaje,
      texto: data.texto,
      usuarioId: data.usuarioId,
      enviadoEn: data.enviadoEn,
    },
  });
}

/** El mensaje más reciente de la conversación (cualquier dirección) — usado por el job de SLA. */
export async function findUltimo(
  conversacionId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Mensaje | null> {
  return client.mensaje.findFirst({
    where: { conversacionId },
    orderBy: { enviadoEn: "desc" },
  });
}

export interface FindManyMensajesResult {
  mensajes: Mensaje[];
  total: number;
}

export async function findByConversacionPaginado(
  conversacionId: string,
  skip: number,
  take: number,
  client: PrismaClientOrTransaction = prisma,
): Promise<FindManyMensajesResult> {
  const [mensajes, total] = await Promise.all([
    client.mensaje.findMany({
      where: { conversacionId },
      orderBy: { enviadoEn: "desc" },
      skip,
      take,
    }),
    client.mensaje.count({ where: { conversacionId } }),
  ]);
  return { mensajes, total };
}
