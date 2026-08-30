import type { Cita, Prisma } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

export interface CreateCitaData {
  leadId: string;
  /**
   * Bloque C (Etapa 3, D4 — RLS): denormalizado desde `Lead.empresaId`,
   * requerido desde esta migración (`citas.empresa_id` NOT NULL).
   */
  empresaId: string;
  usuarioId: string;
  programadaPara: Date;
  modalidad: Cita["modalidad"];
  notas?: Cita["notas"];
}

export async function createCita(
  data: CreateCitaData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Cita> {
  return client.cita.create({ data });
}

export async function findById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Cita | null> {
  return client.cita.findUnique({ where: { id } });
}

/** Más reciente primero — el listado por lead no pagina (volumen bajo por lead, MVP). */
export async function findByLead(
  leadId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Cita[]> {
  return client.cita.findMany({ where: { leadId }, orderBy: { programadaPara: "desc" } });
}

export interface UpdateCitaData {
  estado?: Cita["estado"];
  programadaPara?: Date;
  recordatorioEnviado?: boolean;
}

export async function updateCita(
  id: string,
  data: UpdateCitaData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Cita> {
  return client.cita.update({ where: { id }, data });
}

/**
 * M7 (diseño, trabajo de recordatorio): candidatos exactos para el tick —
 * `estado = AGENDADA`, sin recordatorio previo, `programadaPara` dentro de la
 * ventana `[ahora, ahora + 1h]`. Misma forma que `idx_leads_sla`/`(estado,
 * programadaPara)` de este modelo (ver `schema.prisma`).
 */
export async function findPendientesDeRecordatorio(
  desde: Date,
  hasta: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<Cita[]> {
  return client.cita.findMany({
    where: {
      estado: "AGENDADA",
      recordatorioEnviado: false,
      programadaPara: { gte: desde, lte: hasta },
    },
  });
}

/**
 * D-recordatorio (diseño M7): guarda anti-duplicado atómica a nivel de fila
 * — el `WHERE recordatorioEnviado: false` en el propio `updateMany` es la
 * condición que evita que dos ticks concurrentes marquen la misma cita dos
 * veces (mismo espíritu que el filtro de idempotencia de
 * `sla-atrasado.service.ts`, adaptado a una bandera booleana en vez de un
 * evento append-only, porque `citas.recordatorio_enviado` sí es una bandera
 * de estado, no un log).
 */
export async function marcarRecordatorioEnviado(
  ids: readonly string[],
  client: PrismaClientOrTransaction = prisma,
): Promise<Prisma.BatchPayload> {
  if (ids.length === 0) return { count: 0 };
  return client.cita.updateMany({
    where: { id: { in: [...ids] }, recordatorioEnviado: false },
    data: { recordatorioEnviado: true },
  });
}
