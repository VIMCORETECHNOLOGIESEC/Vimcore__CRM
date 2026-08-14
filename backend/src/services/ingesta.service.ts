import type { Prisma } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { logger } from "../lib/logger.js";
import { INGESTA_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import * as bridgeLogRepository from "../repositories/bridge-log.repository.js";
import * as leadRecibidoRepository from "../repositories/lead-recibido.repository.js";
import type { LeadEntrante } from "../types/lead-entrante.js";
import { deduplicarLead } from "./deduplicacion.service.js";

export interface IngestaResultado {
  leadId: string;
  duplicado: boolean;
}

interface ResultadoTransaccion extends IngestaResultado {
  datosIncompletos: boolean;
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
 * revisable en esta misma función): el único llamado a `deduplicarLead` de
 * este archivo pasa `tx` como tercer argumento, así que su `runInTransaction`
 * interno ve `txExterna` definido y solo ejecuta `fn(txExterna)` — nunca abre
 * una segunda `prisma.$transaction`/conexión (ver `lib/prisma.ts`). Una sola
 * transacción de Postgres cubre recepción + dedupe.
 *
 * `bridge_logs` se escribe SIEMPRE fuera de esta transacción (DD5,
 * Requirement: Bridge log durability), para que sobreviva a un rollback:
 * ERROR tras rollback (respuesta honesta, deja reintentar), ADVERTENCIA si
 * `datosIncompletos` tras commit, INFO en cualquier otro caso tras commit.
 * Cada escritura de log corre en su propio `try/catch` degradando a
 * `logger.error` — un fallo al loguear nunca debe enmascarar el error
 * original que se intentaba registrar.
 */
export async function ingestarLead(entrada: LeadEntrante): Promise<IngestaResultado> {
  try {
    const resultado = await runInTransaction(
      undefined,
      (tx) => procesarEnTransaccion(entrada, tx),
      INGESTA_TRANSACTION_BOUNDS,
    );

    await registrarLogSeguro({
      bridgeId: entrada.bridgeId,
      nivel: resultado.datosIncompletos ? "ADVERTENCIA" : "INFO",
      mensaje: resultado.datosIncompletos
        ? "Lead recibido y procesado con datos incompletos (sin teléfono ni correo)"
        : "Lead recibido y procesado",
      payload: {
        idExternoLead: entrada.idExternoLead,
        leadId: resultado.leadId,
        duplicado: resultado.duplicado,
      },
    });

    return { leadId: resultado.leadId, duplicado: resultado.duplicado };
  } catch (error) {
    await registrarLogSeguro({
      bridgeId: entrada.bridgeId,
      nivel: "ERROR",
      mensaje: error instanceof Error ? error.message : "Error desconocido al procesar la ingesta",
      payload: { idExternoLead: entrada.idExternoLead },
    });
    throw error;
  }
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
  tx: Prisma.TransactionClient,
): Promise<ResultadoTransaccion> {
  const ahora = new Date();

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
    return { leadId: recepcion.leadId, duplicado: true, datosIncompletos: recepcion.datosIncompletos };
  }

  const dedupResultado = await deduplicarLead(entrada, ahora, tx);
  await leadRecibidoRepository.marcarProcesado(recepcion.id, dedupResultado.leadId, tx);

  return {
    leadId: dedupResultado.leadId,
    duplicado: false,
    datosIncompletos: recepcion.datosIncompletos,
  };
}

async function registrarLogSeguro(data: bridgeLogRepository.RegistrarLogData): Promise<void> {
  try {
    await bridgeLogRepository.registrarLog(data);
  } catch (error) {
    logger.error({ err: error, bridgeId: data.bridgeId }, "ingesta: fallo al registrar bridge_logs");
  }
}
