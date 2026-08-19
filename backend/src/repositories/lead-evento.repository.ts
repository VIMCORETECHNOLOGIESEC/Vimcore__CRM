import type { LeadEvento, Prisma } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

export interface CreateEventoData {
  leadId: string;
  tipo: LeadEvento["tipo"];
  /**
   * M6 (diseño, DD5): `LeadEvento.usuarioId` existe desde M3 pero ningún
   * módulo previo lo poblaba. M6 lo agrega opcional y lo puebla con el
   * ejecutor humano — `null` en el camino automático de asignación y en el
   * cron de SLA. La columna es el portador canónico para M9 (agregación SQL
   * sin leer JSON); `DetalleEventoAsignacion.ejecutadoPorId` es el espejo
   * que M8 consume sin join.
   */
  usuarioId?: LeadEvento["usuarioId"];
  etapaAnterior?: LeadEvento["etapaAnterior"];
  etapaNueva?: LeadEvento["etapaNueva"];
  /**
   * M5 (D17, diseño M5): un cambio de color se registra en un evento
   * `CAMBIO_SEMAFORO` propio, independiente de `CAMBIO_ETAPA`, dentro de la
   * misma transacción cuando ambos cambian juntos. Opcionales — el resto de
   * los tipos de evento (M3/M4) los dejan `undefined`/NULL, sin cambio de
   * comportamiento.
   */
  semaforoAnterior?: LeadEvento["semaforoAnterior"];
  semaforoNuevo?: LeadEvento["semaforoNuevo"];
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

/**
 * Fix bulk writes (`deactivateUsuario`, M2): variante en lote de
 * `createEvento` — un solo `createMany` para todos los eventos de una
 * reasignación de cartera masiva, en vez de un `create` awaited por lead.
 * `lead_eventos` sigue siendo bitácora de solo-inserción (§3 docs/03). Si
 * `data` está vacío, no ejecuta ninguna consulta.
 */
export async function createEventos(
  data: readonly CreateEventoData[],
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  if (data.length === 0) return;
  await client.leadEvento.createMany({ data: [...data] });
}

/**
 * M6 (diseño, D4/DD2): consulta por lote para el filtro de idempotencia del
 * cron de SLA — un solo viaje por tick, independiente del número de leads
 * atrasados. Solo trae `leadId`/`ocurridoEn`: el filtro `ocurridoEn >=
 * slaInicioEn` se resuelve en memoria en `jobs/sla-atrasado.job.ts`.
 */
export async function findPorLeadsYTipo(
  leadIds: readonly string[],
  tipo: LeadEvento["tipo"],
  client: PrismaClientOrTransaction = prisma,
): Promise<Array<Pick<LeadEvento, "leadId" | "ocurridoEn">>> {
  if (leadIds.length === 0) return [];
  return client.leadEvento.findMany({
    where: { leadId: { in: [...leadIds] }, tipo },
    select: { leadId: true, ocurridoEn: true },
  });
}

/** Consulta de idempotencia para la ventana SLA vigente de un lead bloqueado. */
export async function findSlaIncumplidoVigente(
  leadId: string,
  slaInicioEn: Date,
  client: PrismaClientOrTransaction,
): Promise<Pick<LeadEvento, "id"> | null> {
  return client.leadEvento.findFirst({
    where: { leadId, tipo: "SLA_INCUMPLIDO", ocurridoEn: { gte: slaInicioEn } },
    select: { id: true },
  });
}
