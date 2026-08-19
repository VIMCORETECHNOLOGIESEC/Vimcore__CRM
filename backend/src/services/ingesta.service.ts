import { AppError } from "../lib/app-error.js";
import { logger } from "../lib/logger.js";
import { INGESTA_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import type { RegistrarLogData } from "../repositories/bridge-log.repository.js";
import * as bridgeRepository from "../repositories/bridge.repository.js";
import * as leadRecibidoRepository from "../repositories/lead-recibido.repository.js";
import type { LeadEntrante } from "../types/lead-entrante.js";
import { assignAfterCommit } from "./asignacion.service.js";
import { publishCommittedEvents } from "./committed-events.service.js";
import { deduplicateLead } from "./deduplicacion.service.js";
import { registrarBridgeLog } from "./bridge-log.service.js";
import { resolverLeadgenMeta } from "./meta-webhook.service.js";
import { scheduleMetricasBroadcast } from "../lib/metricas-broadcast.js";

export interface IngestaResultado {
  recepcionId: string;
  estado: "ACEPTADO";
}

/**
 * Punto de entrada de la ingesta genérica (docs/05-bridges.md §2). Es un
 * passthrough: acepta el lead en el buzón durable (`leads_recibidos`) vía
 * `leadRecibidoRepository.aceptarLeadRecibido` y devuelve de inmediato el
 * `recepcionId` con estado `ACEPTADO`. El procesamiento real (dedupe,
 * asignación, `bridge_logs`) NO ocurre acá — corre asíncronamente en
 * `procesarRecepcion` (mismo archivo), invocada por el worker durable
 * (`runIngestionOnce`/`startIngestionWorker` en `jobs/ingesta-inbox.job.ts`)
 * que reclama filas pendientes del buzón.
 */
export async function ingestarLead(entrada: LeadEntrante): Promise<IngestaResultado> {
  return leadRecibidoRepository.aceptarLeadRecibido(entrada);
}

/**
 * Resuelve el `LeadEntrante` consumible de un sobre de ingesta ANTES de abrir
 * la transacción de dedupe (2026-08-18, cambio consciente: soporte del sobre
 * `META_PENDIENTE_DETALLE` v2). Para un sobre v1 (ingesta genérica) es una
 * traducción pura, sin I/O. Para un sobre v2 (webhook de Meta) implica la
 * consulta a Graph API con sus reintentos (`meta-webhook.service.ts::
 * resolverLeadgenMeta`) — I/O de red lento que NUNCA debe correr dentro de
 * una transacción de Postgres abierta (conexión del pool retenida sin
 * necesidad, más el riesgo de que el `statement_timeout`/`idle_in_transaction
 * _session_timeout` de `INGESTA_TRANSACTION_BOUNDS` la corte a mitad de una
 * llamada HTTP externa). El lease adquirido por `claimNext` (60 s,
 * `INGESTA_LEASE_MS`) ya protege esta sección contra que otro worker reclame
 * la misma fila mientras tanto — sobra margen frente a los ~750ms que tarda
 * como máximo `resolverLeadgenMeta` en agotar sus 3 intentos.
 */
async function resolverEntradaProcesamiento(
  envelope: leadRecibidoRepository.PersistedEntradaProcesamiento,
): Promise<{ entrada: LeadEntrante; recibidoEn: Date }> {
  if (envelope.version === 1) {
    return {
      entrada: { ...envelope.entrada, ingresadoEn: new Date(envelope.entrada.ingresadoEn) },
      recibidoEn: new Date(envelope.recibidoEn),
    };
  }
  if (envelope.version === 2 && envelope.tipo === "META_PENDIENTE_DETALLE") {
    const entrada = await resolverLeadgenMeta({ leadgenId: envelope.leadgenId, pageId: envelope.pageId });
    return { entrada, recibidoEn: new Date(envelope.recibidoEn) };
  }
  throw new AppError("sobre_ingesta_invalido", 500, "El sobre de ingesta no es procesable");
}

export async function procesarRecepcion(
  claim: leadRecibidoRepository.InboxClaim,
): Promise<boolean> {
  const resuelto = await resolverEntradaProcesamiento(claim.entradaProcesamiento);
  const resultado = await runInTransaction(
    undefined,
    async (tx) => {
      const vigente = await leadRecibidoRepository.lockValidClaim(
        claim.recepcionId,
        claim.leaseOwner,
        tx,
      );
      if (!vigente) return null;
      const { entrada, recibidoEn } = resuelto;
      const dedup = await deduplicateLead(entrada, recibidoEn, tx);
      const datosIncompletos = entrada.telefono === null && entrada.correo === null;
      const completed = await leadRecibidoRepository.completeClaim(
        claim.recepcionId,
        claim.leaseOwner,
        dedup.leadId,
        datosIncompletos,
        tx,
      );
      if (!completed) throw new AppError("lease_ingesta_perdido", 409, "El lease de ingesta venció");
      return { entrada, dedup, datosIncompletos };
    },
    INGESTA_TRANSACTION_BOUNDS,
  );
  if (!resultado) {
    logger.warn({ recepcionId: claim.recepcionId }, "ingesta: lease obsoleto rechazado");
    return false;
  }
  publishCommittedEvents(resultado.dedup.events);
  if (resultado.dedup.leadCreado) {
    await assignAfterCommit(resultado.dedup.leadId, new Date(claim.entradaProcesamiento.recibidoEn));
  }
  await registrarLogSeguro({
    bridgeId: resultado.entrada.bridgeId,
    nivel: resultado.datosIncompletos ? "ADVERTENCIA" : "INFO",
    mensaje: resultado.datosIncompletos
      ? "Recepción de lead procesada con datos incompletos (sin teléfono ni correo)"
      : "Recepción de lead procesada",
    payload: { recepcionId: claim.recepcionId, leadId: resultado.dedup.leadId },
  });
  await touchUltimoLeadEnSeguro(resultado.entrada.bridgeId);
  // M9 (docs/08-dashboard-kpis.md §5): "ingreso de lead" dispara la señal de
  // métricas — se agrupa en la ventana de 2s de metricas-broadcast.ts.
  scheduleMetricasBroadcast();
  return true;
}

async function registrarLogSeguro(data: RegistrarLogData): Promise<void> {
  try {
    await registrarBridgeLog(data);
  } catch (error) {
    logger.error({ err: error, bridgeId: data.bridgeId }, "ingesta: fallo al registrar bridge_logs");
  }
}

/**
 * Fuera de la transacción de dedupe, mismo espíritu que `registrarLogSeguro`
 * (DD5): sostiene la detección de bridges mudos (docs/05-bridges.md §8,
 * `services/bridge-mudo.service.ts`), pero un fallo acá nunca debe hacer
 * fallar la recepción del lead ya committeada.
 */
async function touchUltimoLeadEnSeguro(bridgeId: string): Promise<void> {
  try {
    await bridgeRepository.touchUltimoLeadEn(bridgeId);
  } catch (error) {
    logger.error({ err: error, bridgeId }, "ingesta: fallo al actualizar ultimoLeadEn del bridge");
  }
}
