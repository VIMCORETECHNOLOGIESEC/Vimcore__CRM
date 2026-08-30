import type { LeadAbiertoRevisionPendiente } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

export interface UpsertRevisionPendienteParams {
  clienteId: string;
  leadAbiertoId: string;
  empresaLeadId: string;
  empresaIngestaId: string;
}

/**
 * Bloque B (Fase 3, diseño "Ambiguity persistence (NEW)"): upsert idempotente
 * sobre `@@unique([clienteId, leadAbiertoId, empresaIngestaId])` — una
 * segunda repetición desde la MISMA empresa foránea sobre el MISMO lead
 * abierto no duplica la fila (spec, "Client open in more than one company
 * goes to review queue"). `update: {}` es deliberado: la primera detección
 * ya registró toda la evidencia necesaria, no hay campo que reescribir en
 * una repetición.
 */
export async function upsertRevisionPendiente(
  params: UpsertRevisionPendienteParams,
  client: PrismaClientOrTransaction = prisma,
): Promise<LeadAbiertoRevisionPendiente> {
  return client.leadAbiertoRevisionPendiente.upsert({
    where: {
      clienteId_leadAbiertoId_empresaIngestaId: {
        clienteId: params.clienteId,
        leadAbiertoId: params.leadAbiertoId,
        empresaIngestaId: params.empresaIngestaId,
      },
    },
    update: {},
    create: params,
  });
}

