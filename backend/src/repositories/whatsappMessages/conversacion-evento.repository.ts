import type { ConversacionEvento } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

export interface CreateConversacionEventoData {
  conversacionId: string;
  empresaId: string;
  usuarioId?: string | null;
  tipo: ConversacionEvento["tipo"];
}

/** Mirror exacto de `lead-evento.repository.ts::createEvento` — bitácora append-only, nunca update/delete. */
export async function createEvento(
  data: CreateConversacionEventoData,
  client: PrismaClientOrTransaction = prisma,
): Promise<ConversacionEvento> {
  return client.conversacionEvento.create({ data });
}

/** El evento más reciente de la conversación — usado por el job de SLA para calcular la ventana vigente. */
export async function findUltimo(
  conversacionId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<ConversacionEvento | null> {
  return client.conversacionEvento.findFirst({
    where: { conversacionId },
    orderBy: { ocurridoEn: "desc" },
  });
}
