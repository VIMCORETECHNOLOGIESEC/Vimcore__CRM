import { Prisma, type RolUsuario } from "@prisma/client";
import * as leadEventoRepository from "../repositories/lead-evento.repository.js";
import * as leadRepository from "../repositories/lead.repository.js";
import type { DetalleEventoAsignacion } from "./asignacion.service.js";
import { ASIGNACION_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import * as notificationRepository from "../repositories/notificacion.repository.js";
import { notificationEvents, publishCommittedEvents } from "./committed-events.service.js";
import { slaFilterBoundaries } from "./sla.calculator.js";

export interface ResultadoDeteccion {
  candidatos: number;
  eventosCreados: number;
}

/**
 * D2(i) (diseño M6) — handler PURO de efectos: recibe `ahora`, nunca
 * consulta el reloj real ni conoce `setInterval` (eso vive en
 * `jobs/sla-atrasado.job.ts`, que solo hace el wiring del intervalo y la
 * guarda de re-entrada, §4 de AGENTS.md: "la lógica de negocio vive en
 * services"). Todas las pruebas invocan esta función directo; ninguna
 * espera 15 minutos reales.
 *
 * D4/DD2 (idempotencia): dos consultas por tick, independientes del
 * volumen — Q1 trae los candidatos con la forma exacta de `idx_leads_sla`
 * (DD1), Q2 trae sus eventos `SLA_INCUMPLIDO` previos por lote. El filtro
 * `ocurridoEn >= slaInicioEn` (vigente) se resuelve en memoria: reasignar o
 * traspasar mueve `slaInicioEn` hacia adelante y el evento anterior queda
 * automáticamente fuera de la ventana, así el nuevo responsable vuelve a
 * ser alertable sin ninguna columna de reseteo.
 *
 * DD11: sin transacción envolvente — el tick no muta ningún `Lead`/`Usuario`,
 * solo escribe bitácora; un fallo parcial se autocorrige en el siguiente tick.
 */
export async function detectLeadsAtrasados(
  ahora: Date = new Date(),
): Promise<ResultadoDeteccion> {
  const { fronteraAtrasado } = slaFilterBoundaries(ahora);

  const candidatos = await leadRepository.findAtrasadosAbiertos(fronteraAtrasado);
  if (candidatos.length === 0) return { candidatos: 0, eventosCreados: 0 };

  let eventosCreados = 0;
  const managementRoles: readonly RolUsuario[] = ["SUPERVISOR", "ADMINISTRADOR"];
  for (const candidato of candidatos) {
    const committed = await runInTransaction(undefined, async (tx) => {
      await tx.$queryRawUnsafe("SELECT id FROM leads WHERE id = $1::uuid FOR UPDATE", candidato.id);
      const lead = await tx.lead.findUniqueOrThrow({ where: { id: candidato.id } });
      if (!lead.slaInicioEn || lead.slaInicioEn > fronteraAtrasado || lead.cerradoEn) return [];
      const previous = await tx.leadEvento.findFirst({ where: { leadId: lead.id, tipo: "SLA_INCUMPLIDO", ocurridoEn: { gte: lead.slaInicioEn } } });
      if (previous) return [];
      const responsableId = lead.vendedorId ?? lead.asesorId;
      const detalle: DetalleEventoAsignacion = { version: 1, requiereNotificacion: true, motivo: "sla_vencido", responsableId, responsableAnteriorId: null, ejecutadoPorId: null };
      await leadEventoRepository.createEvento({ leadId: lead.id, tipo: "SLA_INCUMPLIDO", usuarioId: null, detalle: detalle as unknown as Prisma.InputJsonValue }, tx);
      const managementIds = await notificationRepository.findActiveRecipientIds(managementRoles, tx);
      const owner = responsableId ? await tx.usuario.findFirst({ where: { id: responsableId, activo: true }, select: { id: true } }) : null;
      const recipientIds = [...new Set([...managementIds, ...(owner ? [owner.id] : [])])];
      const notifications = [];
      for (const usuarioId of recipientIds) notifications.push(await notificationRepository.createNotificacion({ usuarioId, tipo: "LEAD_SIN_ATENDER", titulo: "Lead sin atender", mensaje: "El SLA de atenci�n del lead ha vencido", leadId: lead.id }, tx));
      return notifications.flatMap(notificationEvents);
    }, ASIGNACION_TRANSACTION_BOUNDS);
    if (committed.length > 0) eventosCreados += 1;
    publishCommittedEvents(committed);
  }

  return { candidatos: candidatos.length, eventosCreados };
}
