import type { OportunidadEvento, Prisma } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

/**
 * negociacion (Bloque D): mirror exacto de `lead-evento.repository.ts` --
 * bitácora append-only, nunca `update`/`delete` sobre `OportunidadEvento` en
 * ningún camino de este módulo.
 */
export interface CreateEventoData {
  oportunidadId: string;
  /** Denormalizado desde `Oportunidad.empresaId` (mismo patrón RLS que `LeadEvento`). */
  empresaId: string;
  tipo: OportunidadEvento["tipo"];
  usuarioId?: OportunidadEvento["usuarioId"];
  etapaAnterior?: OportunidadEvento["etapaAnterior"];
  etapaNueva?: OportunidadEvento["etapaNueva"];
  detalle?: Prisma.InputJsonValue;
}

export async function createEvento(
  data: CreateEventoData,
  client: PrismaClientOrTransaction = prisma,
): Promise<OportunidadEvento> {
  return client.oportunidadEvento.create({ data });
}
