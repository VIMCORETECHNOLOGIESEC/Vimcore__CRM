import type { Lead, Prisma } from "@prisma/client";
import * as leadEventoRepository from "../repositories/lead-evento.repository.js";
import * as leadRepository from "../repositories/lead.repository.js";
import type { PoolAsignacion } from "../repositories/lead.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";

export type { PoolAsignacion } from "../repositories/lead.repository.js";

export interface CandidatoAsignacion {
  id: string;
  ultimaAsignacionEn: Date | null;
  cargaActiva: number;
}

/**
 * Orden total determinista entre dos candidatos (DD7, diseño M6):
 * 1. `cargaActiva` ascendente — menor carga gana.
 * 2. `ultimaAsignacionEn` ascendente, con `null` PRIMERO (docs/02 §3.4: "nulo
 *    cuenta como el más antiguo" — un candidato que nunca fue asignado es
 *    más antiguo que cualquier fecha real).
 * 3. `id` ascendente — desempate final determinista si los dos anteriores
 *    coinciden exactamente.
 * Negativo si `a` debe ganar, positivo si `b` debe ganar, 0 si son iguales.
 */
function compareCandidatos(a: CandidatoAsignacion, b: CandidatoAsignacion): number {
  if (a.cargaActiva !== b.cargaActiva) return a.cargaActiva - b.cargaActiva;

  const aTiempo = a.ultimaAsignacionEn === null ? -Infinity : a.ultimaAsignacionEn.getTime();
  const bTiempo = b.ultimaAsignacionEn === null ? -Infinity : b.ultimaAsignacionEn.getTime();
  if (aTiempo !== bTiempo) return aTiempo - bTiempo;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * PURA — sin BD, sin Prisma (DD7, diseño M6). Reutilizable para el pool
 * `ASESOR` y para el pool `VENDEDOR` (D7). Pruebas obligatorias 1 y 2
 * (propuesta/spec).
 */
export function chooseCandidato(
  candidatos: readonly CandidatoAsignacion[],
): CandidatoAsignacion | null {
  if (candidatos.length === 0) return null;

  let ganador = candidatos[0] as CandidatoAsignacion;
  for (const candidato of candidatos.slice(1)) {
    if (compareCandidatos(candidato, ganador) < 0) {
      ganador = candidato;
    }
  }
  return ganador;
}

/**
 * Compone las dos consultas del pool (diseño M6, "selectResponsable
 * compone"): `findActivosPorRol` → filtrar `excluirId` (D9: el titular actual
 * nunca es su propio candidato) → `countCargaActivaPorResponsable` →
 * `cargaActiva = mapa.get(id) ?? 0` (DD8) → `chooseCandidato`. Siempre dentro
 * del `tx` del llamador.
 */
export async function selectResponsable(
  pool: PoolAsignacion,
  tx: Prisma.TransactionClient,
  excluirId?: string,
): Promise<CandidatoAsignacion | null> {
  const activos = await usuarioRepository.findActivosPorRol(pool, tx);
  const candidatosElegibles =
    excluirId === undefined ? activos : activos.filter((u) => u.id !== excluirId);

  if (candidatosElegibles.length === 0) return null;

  const cargas = await leadRepository.countCargaActivaPorResponsable(
    pool,
    candidatosElegibles.map((u) => u.id),
    tx,
  );

  const candidatos: CandidatoAsignacion[] = candidatosElegibles.map((u) => ({
    id: u.id,
    ultimaAsignacionEn: u.ultimaAsignacionEn,
    cargaActiva: cargas.get(u.id) ?? 0,
  }));

  return chooseCandidato(candidatos);
}

export type MotivoAsignacion =
  | "automatica"
  | "manual"
  | "reasignacion"
  | "traspaso"
  | "sin_candidatos"
  | "sla_vencido";

/**
 * D5 (diseño M6) — interfaz NUEVA, no extiende `DetalleEventoLead` de M3: su
 * unión `motivo` y sus campos obligatorios son específicos de deduplicación
 * y no tienen sentido en una asignación/reasignación/traspaso.
 */
export interface DetalleEventoAsignacion {
  version: 1;
  requiereNotificacion: boolean;
  motivo: MotivoAsignacion;
  responsableId: string | null;
  responsableAnteriorId: string | null;
  ejecutadoPorId: string | null;
}

interface ApplyAsignacionInput {
  leadId: string;
  pool: PoolAsignacion;
  receptorId: string;
  responsableAnteriorId: string | null;
  tipoEvento: "ASIGNACION" | "REASIGNACION" | "TRASPASO";
  motivo: MotivoAsignacion;
  /** `null` en el camino automático (D5) — nadie lo ejecutó a mano. */
  ejecutadoPorId: string | null;
  ahora: Date;
}

/**
 * Interna, no exportada (D11, diseño M6): el ÚNICO punto de escritura
 * compartido por los cuatro caminos de asignación. Tres escrituras atómicas,
 * juntas o ninguna — todo dentro del `tx` del llamador, nunca abre una
 * transacción propia:
 *   1. `leads` — responsable (asesorId/vendedorId según `pool`) + `slaInicioEn`.
 *   2. `usuarios.ultima_asignacion_en` del receptor (D10).
 *   3. `lead_eventos` del tipo correspondiente (bitácora inmutable, D-lead_eventos).
 */
async function applyAsignacion(
  input: ApplyAsignacionInput,
  tx: Prisma.TransactionClient,
): Promise<Lead> {
  const lead = await leadRepository.assignResponsable(
    input.leadId,
    { pool: input.pool, responsableId: input.receptorId, slaInicioEn: input.ahora },
    tx,
  );

  await usuarioRepository.updateUltimaAsignacion(input.receptorId, input.ahora, tx);

  const detalle: DetalleEventoAsignacion = {
    version: 1,
    requiereNotificacion: false,
    motivo: input.motivo,
    responsableId: input.receptorId,
    responsableAnteriorId: input.responsableAnteriorId,
    ejecutadoPorId: input.ejecutadoPorId,
  };

  await leadEventoRepository.createEvento(
    {
      leadId: input.leadId,
      tipo: input.tipoEvento,
      usuarioId: input.ejecutadoPorId ?? undefined,
      detalle: detalle as unknown as Prisma.InputJsonValue,
    },
    tx,
  );

  return lead;
}

/**
 * D1 (diseño M6) — el hook de ingesta. Nunca abre transacción: recibe la
 * viva de `ingesta.service::procesarEnTransaccion`. Sin candidatos activos
 * del pool `ASESOR`, el lead queda intacto (`asesorId`/`slaInicioEn` siguen
 * `null`, D3) y solo se escribe un evento `SIN_ASIGNAR` con
 * `requiereNotificacion: true` (D5/D6) para que M8 lo consuma.
 */
export async function assignAutomatically(
  leadId: string,
  ahora: Date,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const candidato = await selectResponsable("ASESOR", tx);

  if (candidato === null) {
    const detalle: DetalleEventoAsignacion = {
      version: 1,
      requiereNotificacion: true,
      motivo: "sin_candidatos",
      responsableId: null,
      responsableAnteriorId: null,
      ejecutadoPorId: null,
    };
    await leadEventoRepository.createEvento(
      {
        leadId,
        tipo: "SIN_ASIGNAR",
        detalle: detalle as unknown as Prisma.InputJsonValue,
      },
      tx,
    );
    return;
  }

  await applyAsignacion(
    {
      leadId,
      pool: "ASESOR",
      receptorId: candidato.id,
      responsableAnteriorId: null,
      tipoEvento: "ASIGNACION",
      motivo: "automatica",
      ejecutadoPorId: null,
      ahora,
    },
    tx,
  );
}
