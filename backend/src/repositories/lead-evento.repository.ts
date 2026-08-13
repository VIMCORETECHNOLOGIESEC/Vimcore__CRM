import type { LeadEvento, Prisma } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

export interface CreateEventoData {
  leadId: string;
  tipo: LeadEvento["tipo"];
  etapaAnterior?: LeadEvento["etapaAnterior"];
  etapaNueva?: LeadEvento["etapaNueva"];
  detalle?: Prisma.InputJsonValue;
}

/**
 * §3 (docs/03-modelo-datos.md): `lead_eventos` es una bitácora inmutable.
 * Esta función solo inserta — nunca hay `update`/`delete` sobre este modelo
 * en ningún módulo (D-responsableId, diseño M3).
 */
export async function createEvento(
  data: CreateEventoData,
  client: PrismaClientOrTransaction = prisma,
): Promise<LeadEvento> {
  return client.leadEvento.create({ data });
}
