import type { Lead, Prisma } from "@prisma/client";
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
  /**
   * M5 (DD1, diseño M5): `deduplicacion.service.ts::createLead` nunca los
   * pasaba pese a que `LeadEntrante` (M4) ya los traía — quedaban NULL para
   * siempre. Opcionales para no romper llamadas existentes que no los
   * proveen (p. ej. pruebas de M3 que no simulan M4).
   */
  redSocial?: Lead["redSocial"];
  payloadOriginal?: Prisma.InputJsonValue;
  camposDinamicos?: Prisma.InputJsonValue;
}

export async function createLead(
  data: CreateLeadData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Lead> {
  return client.lead.create({ data });
}

export interface UpdateSemaforoData {
  semaforo: Lead["semaforo"];
  puntuacion: Lead["puntuacion"];
}

/**
 * M5 (DD4, diseño): escritura del motor de semáforo — solo toca
 * `semaforo`/`puntuacion`, nunca `etapa` (D16: recalificar no mueve la
 * etapa del lead).
 */
export async function updateSemaforo(
  id: string,
  data: UpdateSemaforoData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Lead> {
  return client.lead.update({ where: { id }, data });
}
