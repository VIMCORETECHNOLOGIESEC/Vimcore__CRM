import * as citaRepository from "../repositories/cita.repository.js";
import { CITAS_TRANSACTION_BOUNDS, prisma, runAsBypassJob, runWithTenantContext } from "../lib/prisma.js";
import { rangoManianaEcuador } from "../lib/rango-fechas.js";
import * as notificationRepository from "../repositories/notificacion.repository.js";
import { notificationEvents, publishCommittedEvents } from "./committed-events.service.js";
import { partitionByEmpresa } from "./company-partition.js";

export interface ResultadoRecordatorioCitas {
  candidatos: number;
  recordatoriosMarcados: number;
}

/**
 * D-recordatorio (diseño M7, checklist "Trabajo programado: recordatorio 1
 * hora antes" — ventana cambiada por una feature aditiva post-M7, ver
 * abajo). Handler PURO de efectos — recibe `ahora`, nunca consulta el reloj
 * real ni conoce `setInterval` (eso vive en
 * `jobs/citas-recordatorio.job.ts`, mismo split que
 * `sla-atrasado.service.ts`/`sla-atrasado.job.ts` de M6).
 *
 * Cambio de ventana (feature aditiva post-M7, vista de calendario): ya no es
 * "próxima 1h" — es TODO el día calendario de MAÑANA en hora Ecuador
 * (`lib/rango-fechas.ts::rangoManianaEcuador`, offset fijo UTC-5, sin
 * horario de verano). Candidatos: `estado = AGENDADA`, `recordatorioEnviado
 * = false`, `programadaPara` dentro de `[mañana 00:00:00, mañana
 * 23:59:59.999]` Ecuador. Se mantiene UNA notificación por cada `Cita`
 * individual (NUNCA se agrupan varias citas del mismo responsable en una
 * sola notificación) — el loop de abajo sigue siendo por-cita, sin cambios
 * en ese punto. La marca de "recordatorio enviado" sigue siendo atómica a
 * nivel de fila (`cita.repository.ts::marcarRecordatorioEnviado`, `WHERE
 * recordatorioEnviado = false` en el propio `updateMany`), mismo espíritu
 * anti-duplicado que el filtro de idempotencia de `detectLeadsAtrasados`.
 *
 * **Límite explícito de esta rebanada (M7): la emisión REAL de la
 * notificación al responsable — y su entrega en tiempo real por SSE — es de
 * M8** (`docs/06-modulos-backend.md`, "Servicio de creación de
 * notificaciones" / canal SSE). Ese canal no existe todavía en el código.
 * Este job solo dos cosas: (1) marca `recordatorio_enviado = true` de forma
 * atómica para que M8 no dispare el mismo recordatorio dos veces, y (2) deja
 * un log estructurado por cada cita — el punto de enganche donde M8 debe
 * reemplazar el `logger.info` por la escritura real en `notificaciones` +
 * emisión SSE, sin inventar infraestructura de notificaciones aquí.
 */
export async function enviarRecordatoriosCita(
  ahora: Date = new Date(),
): Promise<ResultadoRecordatorioCitas> {
  const { desde, hasta } = rangoManianaEcuador(ahora);

  // Bloque C (Etapa 3, D1/spec §2 "Approved job crosses companies", batch 3
  // discovery): este cron (`jobs/citas-recordatorio.job.ts`) corre sin
  // `AsyncLocalStorage` de tenant y necesita ver citas pendientes de TODAS
  // las empresas — mismo criterio que `sla-atrasado.service.ts::
  // detectLeadsAtrasados`.
  const candidatos = await runAsBypassJob(
    "appointment-reminder",
    (tx) => citaRepository.findPendientesDeRecordatorio(desde, hasta, tx),
    CITAS_TRANSACTION_BOUNDS,
  );
  if (candidatos.length === 0) return { candidatos: 0, recordatoriosMarcados: 0 };

  let recordatoriosMarcados = 0;
  for (const [empresaId, partition] of partitionByEmpresa(candidatos)) {
    await runWithTenantContext({ empresaId }, async () => {
      for (const cita of partition) {
        const committed = await prisma.$transaction(async (tx) => {
      const claimed = await citaRepository.marcarRecordatorioEnviado([cita.id], tx);
      if (claimed.count === 0) return [];
      const notification = await notificationRepository.createNotificacion(
        {
          usuarioId: cita.usuarioId,
          tipo: "RECORDATORIO_CITA",
          titulo: "Recordatorio de cita",
          mensaje: "Tienes una cita programada para " + cita.programadaPara.toISOString(),
          leadId: cita.leadId,
          empresaId: cita.empresaId,
        },
        tx,
      );
      return notificationEvents(notification);
        }, CITAS_TRANSACTION_BOUNDS);
        if (committed.length > 0) recordatoriosMarcados += 1;
        publishCommittedEvents(committed);
      }
    });
  }

  return { candidatos: candidatos.length, recordatoriosMarcados };
}
