import type { Prisma } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { logger } from "../lib/logger.js";
import { INGESTA_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import type { RegistrarLogData } from "../repositories/bridge-log.repository.js";
import * as leadRecibidoRepository from "../repositories/lead-recibido.repository.js";
import type { LeadEntrante } from "../types/lead-entrante.js";
import { asignarTrasCommit } from "./asignacion.service.js";
import { publishCommittedEvents, type CommittedEvent } from "./committed-events.service.js";
import { deduplicateLead } from "./deduplicacion.service.js";
import { registrarBridgeLog } from "./bridge-log.service.js";
import { resolverLeadgenMeta } from "./meta-webhook.service.js";

export interface IngestaResultado {
  recepcionId: string;
  estado: "ACEPTADO";
}

interface ResultadoTransaccion {
  leadId: string;
  duplicado: boolean;
  datosIncompletos: boolean;
  /**
   * D-A2 (diseño, revisión 2): propagado desde `DeduplicacionResult` para que
   * `ingestarLead` sepa, YA FUERA de la transacción, si corresponde disparar
   * `asignarTrasCommit`. `false` en el camino de recepción duplicada
   * (`ON CONFLICT`) — un reingreso nunca reintenta la asignación.
   */
  leadCreado: boolean;
  events: CommittedEvent[];
}

/**
 * Punto de entrada de la ingesta genérica (docs/05-bridges.md §2, diseño M4
 * DD5). `runInTransaction(undefined, ...)` abre una única transacción
 * interactiva (`INGESTA_TRANSACTION_BOUNDS`, DD3) SIN `isolationLevel`: READ
 * COMMITTED es una precondición de corrección (DD2 verificada en el spec),
 * no una preferencia de estilo — bajo REPEATABLE READ el perdedor de la
 * carrera de `ON CONFLICT` de `upsertLeadRecibido` lanzaría 40001 en vez de
 * bloquear, igual que ya documenta `deduplicacion.service.ts`.
 *
 * Autocomprobación DD2 (no es una prueba separada, es invariante estructural
 * revisable en esta misma función): el único llamado a `deduplicateLead` de
 * este archivo pasa `tx` como tercer argumento, así que su `runInTransaction`
 * interno ve `txExterna` definido y solo ejecuta `fn(txExterna)` — nunca abre
 * una segunda `prisma.$transaction`/conexión (ver `lib/prisma.ts`). Una sola
 * transacción de Postgres cubre recepción + dedupe.
 *
 * `bridge_logs` se escribe SIEMPRE fuera de esta transacción (DD5,
 * Requirement: Bridge log durability), para que sobreviva a un rollback:
 * ERROR tras rollback (respuesta honesta, deja reintentar), INFO tras commit
 * para toda recepción exitosa, y además ADVERTENCIA tras commit cuando la
 * recepción es un sobre v2 de Meta con `datosIncompletos` (sin teléfono ni
 * correo) — la v1 genérica ya conoce ese dato en el `POST`, así que su log
 * de completación no lleva esta condición (docs/05-bridges.md §8). Cada
 * escritura de log corre en su propio `try/catch` degradando a
 * `logger.error` — un fallo al loguear nunca debe enmascarar el error
 * original que se intentaba registrar.
 *
 * D-A2 (diseño, revisión 2 — cambio consciente de M6 D1): la asignación
 * automática YA NO corre dentro de la transacción de ingesta. `ahoraIngesta`
 * se captura ANTES de abrir la transacción y es el mismo valor que se
 * propaga a `asignarTrasCommit` tras el commit — así `slaInicioEn` queda
 * fijado con el instante de ingesta, nunca con el instante (posiblemente
 * retrasado por reintentos) en que la asignación automática efectivamente
 * concluye. `asignarTrasCommit` se AWAIT-ea (no es una promesa flotante:
 * DD3 del diseño la rechaza — un rechazo no capturado se perdería en
 * silencio) pero **nunca lanza**, así que esta respuesta HTTP es SIEMPRE
 * 200 con el `leadId` committeado, independientemente del resultado de la
 * asignación (Requirement: La respuesta HTTP de ingesta nunca depende del
 * resultado de la asignación).
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
    await asignarTrasCommit(resultado.dedup.leadId, new Date(claim.entradaProcesamiento.recibidoEn));
  }
  await registrarLogSeguro({
    bridgeId: resultado.entrada.bridgeId,
    nivel: "INFO",
    mensaje: "Recepción de lead procesada",
    payload: { recepcionId: claim.recepcionId, leadId: resultado.dedup.leadId },
  });
  // (2026-08-18, fix acotado a Meta v2, docs/05-bridges.md §8 "Lead sin
  // teléfono ni correo → ... notificar a supervisores"): la ruta genérica
  // (v1) ya conoce teléfono/correo en el `POST` — su log de completación
  // arriba se deja intacto, sin condicionar. La v2 de Meta solo conoce el
  // detalle real DESPUÉS de este commit (Graph API resuelto en el worker),
  // así que necesita su propio aviso ADVERTENCIA en este punto —
  // reutilizando `registrarBridgeLog`, el mismo mecanismo que ya notifica a
  // administradores/supervisores en el resto del pipeline (ver
  // `meta-webhook.service.ts::resolverLeadgenMeta`), sin inventar uno nuevo.
  if (claim.entradaProcesamiento.version === 2 && resultado.datosIncompletos) {
    await registrarLogSeguro({
      bridgeId: resultado.entrada.bridgeId,
      nivel: "ADVERTENCIA",
      mensaje: "Meta: lead recibido y procesado con datos incompletos (sin teléfono ni correo)",
      payload: { recepcionId: claim.recepcionId, leadId: resultado.dedup.leadId },
    });
  }
  return true;
}

/**
 * Cuerpo de la transacción única (DD2(b)/DD5): `upsertLeadRecibido` es la
 * PRIMERA sentencia, sin excepciones — mismo razonamiento de "identidad
 * primero" que serializa a los llamadores concurrentes en
 * `deduplicacion.service.ts`. Si la recepción ya existía (`recepcionCreada`
 * falso), corta camino con el `leadId` ya resuelto en vez de volver a correr
 * la deduplicación (Requirement: Idempotent reception).
 */
async function procesarEnTransaccion(
  entrada: LeadEntrante,
  ahora: Date,
  tx: Prisma.TransactionClient,
): Promise<ResultadoTransaccion> {
  const recepcion = await leadRecibidoRepository.upsertLeadRecibido(
    {
      bridgeId: entrada.bridgeId,
      idExternoLead: entrada.idExternoLead,
      payload: entrada.payloadOriginal,
      datosIncompletos: entrada.telefono === null && entrada.correo === null,
    },
    tx,
  );

  if (!recepcion.recepcionCreada) {
    if (recepcion.leadId === null) {
      // No alcanzable bajo DD2(b): un conflicto de `ON CONFLICT` solo ocurre
      // sobre una fila ya COMMITTEADA, y `marcarProcesado` corre en la misma
      // transacción que ese commit — así que `leadId` ya está resuelto.
      // Invariante explícita en vez de una aserción de tipos silenciosa.
      throw new AppError(
        "recepcion_sin_lead",
        500,
        "Recepción duplicada sin lead asociado: invariante de idempotencia violada",
      );
    }
    return {
      leadId: recepcion.leadId,
      duplicado: true,
      datosIncompletos: recepcion.datosIncompletos,
      leadCreado: false,
      events: [],
    };
  }

  const dedupResultado = await deduplicateLead(entrada, ahora, tx);
  await leadRecibidoRepository.marcarProcesado(recepcion.id, dedupResultado.leadId, tx);

  // D-A2 (diseño, revisión 2 — cambio consciente de M6 D1): la asignación
  // automática YA NO corre en esta transacción. Este cuerpo solo persiste
  // (recepción + dedupe) y propaga `leadCreado`; `ingestarLead` dispara
  // `asignarTrasCommit` DESPUÉS de que esta transacción haga commit (ver
  // nota en `ingestarLead` arriba). `deduplicacion.service.ts` no se toca —
  // el hook sigue viviendo del lado del consumidor de
  // `DeduplicacionResult.leadCreado`, solo que ahora ese consumidor es
  // `ingestarLead`, no este cuerpo transaccional.
  return {
    leadId: dedupResultado.leadId,
    duplicado: false,
    datosIncompletos: recepcion.datosIncompletos,
    leadCreado: dedupResultado.leadCreado,
    events: dedupResultado.events,
  };
}

async function registrarLogSeguro(data: RegistrarLogData): Promise<void> {
  try {
    await registrarBridgeLog(data);
  } catch (error) {
    logger.error({ err: error, bridgeId: data.bridgeId }, "ingesta: fallo al registrar bridge_logs");
  }
}
