import type { Lead } from "@prisma/client";
import { EtapaLead } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

/**
 * §2 (docs/02-reglas-negocio.md): un lead está "abierto" mientras su etapa
 * no sea una etapa de cierre. `VENTA`/`NO_VENTA` son las dos únicas etapas
 * de cierre — cualquier otra cuenta como abierta.
 */
const ETAPAS_CERRADAS = [EtapaLead.VENTA, EtapaLead.NO_VENTA] as const;

export async function findLeadAbierto(
  clienteId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Lead | null> {
  return client.lead.findFirst({
    where: { clienteId, etapa: { notIn: [...ETAPAS_CERRADAS] } },
  });
}

/**
 * Ordenado por `cerradoEn desc` (índice `(cliente_id, cerrado_en DESC)`,
 * diseño M3): el decisor solo necesita el cierre más reciente para calcular
 * la ventana de reingreso de 90 días.
 */
export async function findUltimoLeadCerrado(
  clienteId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Lead | null> {
  return client.lead.findFirst({
    where: { clienteId, etapa: { in: [...ETAPAS_CERRADAS] } },
    orderBy: { cerradoEn: "desc" },
  });
}

export interface CreateLeadData {
  clienteId: string;
  origen: Lead["origen"];
  ingresadoEn: Date;
}

export async function createLead(
  data: CreateLeadData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Lead> {
  return client.lead.create({ data });
}
