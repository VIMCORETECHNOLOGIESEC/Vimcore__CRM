import type { Prisma } from "@prisma/client";
import { AppError } from "../../lib/app-error.js";
import { logger } from "../../lib/logger.js";
import * as membresiaPoolRepository from "../../repositories/negociacion/membresia-pool.repository.js";
import * as oportunidadEventoRepository from "../../repositories/negociacion/oportunidad-evento.repository.js";
import * as oportunidadRepository from "../../repositories/negociacion/oportunidad.repository.js";
import { OportunidadVersionConflictError } from "../../repositories/negociacion/oportunidad.repository.js";

export { OportunidadVersionConflictError };

/**
 * negociacion (Bloque D, D3/D4/D9): motor de asignación por pool para
 * `Oportunidad`, escrito DESDE CERO -- deliberadamente NO importa
 * `asignacion.service.ts` (Lead/Usuario.rol, archivo congelado en este
 * batch). Mismo algoritmo conceptual (menor carga activa + desempate FIFO
 * por `ultimaAsignacionEn`, DD7 de ese archivo) pero recableado sobre
 * `Oportunidad`/`Membresia` desde el día uno, que es el estado final al que
 * apunta todo Bloque D.
 */

/** Mismo número que `asignacion.service.ts::CAS_MAX_INTENTOS` (D6) -- 3 intentos, sin backoff. */
const CAS_MAX_INTENTOS = 3;

/**
 * Envuelve la escritura de reasignación manual (D9) — nunca la asignación
 * automática al crear (`asignarPorPool`), que asigna sobre una fila recién
 * creada dentro de su propia transacción y no puede tener otro escritor
 * concurrente todavía (mismo criterio que `assignAutomatically` en el
 * archivo de Lead). Cada intento reintenta `fn` completo -- normalmente una
 * transacción nueva que relee la Oportunidad vigente.
 */
export async function withCasRetryOportunidad<T>(fn: () => Promise<T>): Promise<T> {
  let ultimoConflicto: OportunidadVersionConflictError | undefined;
  for (let intento = 1; intento <= CAS_MAX_INTENTOS; intento += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof OportunidadVersionConflictError)) throw error;
      ultimoConflicto = error;
    }
  }
  logger.warn(
    {
      event: "oportunidad_asignacion_conflicto_cas_agotado",
      oportunidadId: ultimoConflicto?.oportunidadId,
      intentos: CAS_MAX_INTENTOS,
    },
    "negociacion: se agotaron los intentos de CAS al reasignar la oportunidad",
  );
  throw new AppError(
    "oportunidad_asignacion_conflicto",
    409,
    "No se pudo completar la asignación tras varios intentos — otro usuario modificó la oportunidad al mismo tiempo. Intenta nuevamente.",
  );
}

export interface CandidatoAsignacionOportunidad {
  id: string;
  ultimaAsignacionEn: Date | null;
  cargaActiva: number;
}

/** Mismo orden total determinista que `asignacion.service.ts::compareCandidatos` (DD7). */
function compareCandidatos(a: CandidatoAsignacionOportunidad, b: CandidatoAsignacionOportunidad): number {
  if (a.cargaActiva !== b.cargaActiva) return a.cargaActiva - b.cargaActiva;

  const aTiempo = a.ultimaAsignacionEn === null ? -Infinity : a.ultimaAsignacionEn.getTime();
  const bTiempo = b.ultimaAsignacionEn === null ? -Infinity : b.ultimaAsignacionEn.getTime();
  if (aTiempo !== bTiempo) return aTiempo - bTiempo;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** PURA -- sin BD, sin Prisma. Mismo contrato que `asignacion.service.ts::chooseCandidato`. */
export function chooseCandidato(
  candidatos: readonly CandidatoAsignacionOportunidad[],
): CandidatoAsignacionOportunidad | null {
  if (candidatos.length === 0) return null;

  let ganador = candidatos[0] as CandidatoAsignacionOportunidad;
  for (const candidato of candidatos.slice(1)) {
    if (compareCandidatos(candidato, ganador) < 0) {
      ganador = candidato;
    }
  }
  return ganador;
}

/**
 * D3/D4: compone las dos consultas del pool -- candidatos activos (`Membresia`
 * ASESOR de la empresa) → filtrar `excluirId` (el titular actual nunca es su
 * propio candidato) → carga activa → `chooseCandidato`. Siempre dentro del
 * `tx` del llamador.
 */
export async function selectAsesor(
  empresaId: string,
  tx: Prisma.TransactionClient,
  excluirId?: string,
): Promise<CandidatoAsignacionOportunidad | null> {
  const activos = await membresiaPoolRepository.findActivosAsesoresPorEmpresa(empresaId, tx);
  const elegibles = excluirId === undefined ? activos : activos.filter((c) => c.id !== excluirId);

  if (elegibles.length === 0) return null;

  const cargas = await oportunidadRepository.countCargaActivaPorAsesor(
    empresaId,
    elegibles.map((c) => c.id),
    tx,
  );

  const candidatos: CandidatoAsignacionOportunidad[] = elegibles.map((c) => ({
    id: c.id,
    ultimaAsignacionEn: c.ultimaAsignacionEn,
    cargaActiva: cargas.get(c.id) ?? 0,
  }));

  return chooseCandidato(candidatos);
}

/**
 * D3/D4: asigna automáticamente al crear una `Oportunidad`. Mismo criterio
 * que `TipoEventoLead.SIN_ASIGNAR`: sin candidatos en el pool, la
 * `Oportunidad` queda creada con `asesorId: null` -- nunca falla la
 * creación, la negociación es real aunque no haya quién la atienda todavía
 * -- pero deja constancia explícita con `TipoEventoOportunidad.SIN_ASIGNAR`
 * para que quede visible. La salida es la excepción D9
 * (`reasignarOportunidadExcepcion`), no un reintento automático.
 */
export async function asignarPorPool(
  oportunidadId: string,
  empresaId: string,
  ahora: Date,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const candidato = await selectAsesor(empresaId, tx);
  if (candidato === null) {
    await oportunidadEventoRepository.createEvento(
      { oportunidadId, empresaId, tipo: "SIN_ASIGNAR" },
      tx,
    );
    return;
  }

  // `expectedVersion: 0` -- la Oportunidad fue creada en esta misma
  // transacción (`Oportunidad.version @default(0)`), sin escritor
  // concurrente posible todavía (mismo criterio que
  // `asignacion.service.ts::assignAutomatically`, D1: nunca envuelto en
  // retry CAS).
  await oportunidadRepository.assignAsesor(oportunidadId, { asesorId: candidato.id }, 0, tx);
  await membresiaPoolRepository.updateUltimaAsignacion(candidato.id, ahora, tx);
  await oportunidadEventoRepository.createEvento(
    {
      oportunidadId,
      empresaId,
      tipo: "ASIGNADA_POOL",
      detalle: { asesorId: candidato.id },
    },
    tx,
  );
}
