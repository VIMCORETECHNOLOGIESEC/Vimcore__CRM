import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

export interface UpsertLeidoHastaData {
  conversacionId: string;
  usuarioId: string;
  empresaId: string;
  leidoHastaEn: Date;
}

/**
 * `@@unique([usuarioId, conversacionId])` del schema -- una fila por
 * (usuario, conversación), siempre "avanza" a `leidoHastaEn` más reciente
 * (nunca hace falta comparar contra el valor previo: marcar como leído dos
 * veces seguidas, o desde dos pestañas a la vez, converge al mismo
 * resultado sin importar el orden).
 */
export async function upsertLeidoHasta(
  data: UpsertLeidoHastaData,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.conversacionLectura.upsert({
    where: { usuarioId_conversacionId: { usuarioId: data.usuarioId, conversacionId: data.conversacionId } },
    update: { leidoHastaEn: data.leidoHastaEn },
    create: data,
  });
}

export interface LeidoHastaPorConversacion {
  conversacionId: string;
  leidoHastaEn: Date;
}

/**
 * Lookup en bloque para `listConversaciones` (`conversaciones.service.ts`):
 * el watermark de ESTE usuario para cada conversación de la página actual,
 * en una sola consulta -- nunca N+1 por fila del listado.
 */
export async function findLeidoHastaPorConversaciones(
  usuarioId: string,
  conversacionIds: readonly string[],
  client: PrismaClientOrTransaction = prisma,
): Promise<LeidoHastaPorConversacion[]> {
  if (conversacionIds.length === 0) return [];
  return client.conversacionLectura.findMany({
    where: { usuarioId, conversacionId: { in: [...conversacionIds] } },
    select: { conversacionId: true, leidoHastaEn: true },
  });
}
