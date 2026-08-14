import type { Prisma } from "@prisma/client";
import * as leadEventoRepository from "../repositories/lead-evento.repository.js";
import * as leadRepository from "../repositories/lead.repository.js";
import type { DetalleEventoAsignacion } from "./asignacion.service.js";
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

  const previos = await leadEventoRepository.findPorLeadsYTipo(
    candidatos.map((lead) => lead.id),
    "SLA_INCUMPLIDO",
  );

  const ultimoPorLead = new Map<string, Date>();
  for (const evento of previos) {
    const actual = ultimoPorLead.get(evento.leadId);
    if (!actual || evento.ocurridoEn > actual) ultimoPorLead.set(evento.leadId, evento.ocurridoEn);
  }

  let eventosCreados = 0;
  for (const lead of candidatos) {
    const ultimo = ultimoPorLead.get(lead.id);
    // `slaInicioEn` nunca es null aquí: Q1 filtra por `lte: fronteraAtrasado`.
    if (ultimo && lead.slaInicioEn && ultimo >= lead.slaInicioEn) continue;

    const detalle: DetalleEventoAsignacion = {
      version: 1,
      requiereNotificacion: true, // D5 — M8 lo consume
      motivo: "sla_vencido",
      responsableId: lead.vendedorId ?? lead.asesorId, // D13
      responsableAnteriorId: null,
      ejecutadoPorId: null,
    };
    await leadEventoRepository.createEvento({
      leadId: lead.id,
      tipo: "SLA_INCUMPLIDO",
      usuarioId: null,
      detalle: detalle as unknown as Prisma.InputJsonValue,
    });
    eventosCreados += 1;
  }

  return { candidatos: candidatos.length, eventosCreados };
}
