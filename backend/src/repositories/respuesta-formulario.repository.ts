import type { Prisma, RespuestaFormulario, Semaforo } from "@prisma/client";
import type { EtapaLead } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

export interface CreateRespuestaData {
  leadId: string;
  usuarioId: string;
  etapa: EtapaLead;
  respuestas: Prisma.InputJsonValue;
  puntuacion: number;
  semaforo: Semaforo;
  /** D12 (diseño M5): versión de la rúbrica vigente al momento del cálculo. */
  versionRubrica: string;
}

/**
 * D8 (docs/03 §respuestas_formulario, diseño M5): historial inmutable — solo
 * inserta, nunca hay `update`/`delete` sobre este modelo en ningún módulo,
 * igual que `lead-evento.repository.ts::createEvento`.
 */
export async function createRespuesta(
  data: CreateRespuestaData,
  client: PrismaClientOrTransaction = prisma,
): Promise<RespuestaFormulario> {
  return client.respuestaFormulario.create({ data });
}
