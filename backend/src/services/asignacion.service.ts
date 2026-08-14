import type { EtapaLead, Lead, Prisma, RolUsuario } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { ASIGNACION_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import * as leadEventoRepository from "../repositories/lead-evento.repository.js";
import * as leadRepository from "../repositories/lead.repository.js";
import type { PoolAsignacion } from "../repositories/lead.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";
import type { AsignarBody, ReasignarBody, TraspasarBody } from "../schemas/leads.schema.js";
import { canReassign, canTransfer, type MotivoDenegacion, type UsuarioAcceso } from "./leads.access.js";
import type { LeadConSla } from "./leads.service.js";
import { calculateEstadoSla } from "./sla.calculator.js";

export type { PoolAsignacion } from "../repositories/lead.repository.js";

const ROLES_ACCESO_TOTAL: readonly RolUsuario[] = ["ADMINISTRADOR", "SUPERVISOR"];

/**
 * M6 (diseño, "Cálculo de menor carga activa"): re-tipada localmente para
 * ensanchar el tipo tupla-literal (`as const` en `lead.repository.ts`) al
 * tipo amplio `EtapaLead` — así `.includes(lead.etapa)` acepta cualquier
 * valor del enum sin duplicar los dos valores en una cuarta constante (la
 * fuente de verdad sigue siendo `leadRepository.ETAPAS_CERRADAS`).
 */
const ETAPAS_CERRADAS: readonly EtapaLead[] = leadRepository.ETAPAS_CERRADAS;

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

/**
 * Espejo local del helper privado de `leads.service.ts` (no se modifica ese
 * archivo — no figura en la tabla de cambios de archivos del diseño M6):
 * mismo cálculo de una línea con `sla.calculator.ts`, sin duplicar reglas de
 * negocio, solo la combinación `Lead + estadoSla` para el payload HTTP.
 */
function withEstadoSla(lead: Lead, ahora: Date): LeadConSla {
  return { ...lead, estadoSla: calculateEstadoSla(lead.slaInicioEn, lead.cerradoEn, ahora) };
}

/** DD12 (diseño M6): las tres operaciones manuales rechazan un lead cerrado. */
function assertLeadAbierto(lead: Lead): void {
  if (ETAPAS_CERRADAS.includes(lead.etapa)) {
    throw new AppError("lead_cerrado", 409, "El lead ya está en una etapa terminal y no puede reasignarse");
  }
}

/**
 * DD9 (diseño M6): traduce el `MotivoDenegacion` puro de `leads.access.ts` al
 * código HTTP — único punto de mapeo, reutilizado por las tres operaciones
 * manuales (tarea 2.14).
 */
function throwPorMotivoDenegacion(motivo: MotivoDenegacion): never {
  if (motivo === "etapa_no_traspasable") {
    throw new AppError(
      "etapa_no_traspasable",
      409,
      "Un lead en etapa NUEVO no puede traspasarse",
    );
  }
  throw new AppError("permiso_denegado", 403, "No tienes permiso para esta acción");
}

/**
 * D9 (diseño M6, "Selección de destinatario según rol ejecutor"): si el
 * actor indicó `destinoId` (solo posible para Admin/Supervisor, DD10), lo
 * valida contra los activos del pool y lo usa directo — sin correr el
 * algoritmo. Si no, corre `selectResponsable` (el algoritmo de menor carga).
 * El titular actual (`excluirId`) nunca es su propio candidato ni su propio
 * destinatario explícito.
 */
async function resolveReceptor(
  pool: PoolAsignacion,
  tx: Prisma.TransactionClient,
  excluirId: string | undefined,
  destinoId: string | undefined,
): Promise<string> {
  if (destinoId !== undefined) {
    if (destinoId === excluirId) {
      throw new AppError(
        "destinatario_invalido",
        409,
        "El destinatario no puede ser el responsable actual",
      );
    }
    const activos = await usuarioRepository.findActivosPorRol(pool, tx);
    const esValido = activos.some((candidato) => candidato.id === destinoId);
    if (!esValido) {
      throw new AppError("destinatario_invalido", 409, "El destinatario indicado no es válido");
    }
    return destinoId;
  }

  const candidato = await selectResponsable(pool, tx, excluirId);
  if (candidato === null) {
    throw new AppError("sin_candidatos", 409, "No hay candidatos disponibles para la asignación");
  }
  return candidato.id;
}

/**
 * `POST /api/v1/leads/:id/asignar` (diseño M6). La ruta ya restringe el rol a
 * ADMINISTRADOR/SUPERVISOR (`requireRole`, primer uso del router) — DD10 se
 * respeta de todos modos de forma defensiva ante una invocación directa del
 * servicio.
 */
export async function assignLead(
  usuario: UsuarioAcceso,
  leadId: string,
  body: AsignarBody,
): Promise<LeadConSla> {
  return runInTransaction(
    undefined,
    async (tx) => {
      const ahora = new Date();
      const lead = await leadRepository.findById(leadId, tx);
      if (!lead) throw new AppError("lead_no_encontrado", 404, "El lead no existe");
      assertLeadAbierto(lead);

      const destino = ROLES_ACCESO_TOTAL.includes(usuario.rol) ? body.asesorId : undefined;
      const receptorId = await resolveReceptor("ASESOR", tx, lead.asesorId ?? undefined, destino);

      const leadActualizado = await applyAsignacion(
        {
          leadId,
          pool: "ASESOR",
          receptorId,
          responsableAnteriorId: lead.asesorId,
          tipoEvento: "ASIGNACION",
          motivo: "manual",
          ejecutadoPorId: usuario.id,
          ahora,
        },
        tx,
      );

      return withEstadoSla(leadActualizado, ahora);
    },
    ASIGNACION_TRANSACTION_BOUNDS,
  );
}

/**
 * `POST /api/v1/leads/:id/reasignar` (diseño M6, D8): la regla híbrida
 * rol+recurso vive en `canReassign`, evaluada aquí sobre el lead leído de BD
 * dentro de la transacción — nunca en middleware ni sobre datos del body.
 */
export async function reassignLead(
  usuario: UsuarioAcceso,
  leadId: string,
  body: ReasignarBody,
): Promise<LeadConSla> {
  return runInTransaction(
    undefined,
    async (tx) => {
      const ahora = new Date();
      const lead = await leadRepository.findById(leadId, tx);
      if (!lead) throw new AppError("lead_no_encontrado", 404, "El lead no existe");
      assertLeadAbierto(lead);

      const motivoDenegacion = canReassign(usuario, {
        asesorId: lead.asesorId,
        vendedorId: lead.vendedorId,
        semaforo: lead.semaforo,
      });
      if (motivoDenegacion !== null) throwPorMotivoDenegacion(motivoDenegacion);

      const destino = ROLES_ACCESO_TOTAL.includes(usuario.rol) ? body.asesorId : undefined;
      const receptorId = await resolveReceptor("ASESOR", tx, lead.asesorId ?? undefined, destino);

      const leadActualizado = await applyAsignacion(
        {
          leadId,
          pool: "ASESOR",
          receptorId,
          responsableAnteriorId: lead.asesorId,
          tipoEvento: "REASIGNACION",
          motivo: "reasignacion",
          ejecutadoPorId: usuario.id,
          ahora,
        },
        tx,
      );

      return withEstadoSla(leadActualizado, ahora);
    },
    ASIGNACION_TRANSACTION_BOUNDS,
  );
}

/**
 * `POST /api/v1/leads/:id/traspasar` (diseño M6, D9): pool `VENDEDOR`. La
 * compuerta de etapa (`NUEVO` → 409) vive en `canTransfer` y aplica a todos
 * los roles, incluido Administrador.
 */
export async function transferLead(
  usuario: UsuarioAcceso,
  leadId: string,
  body: TraspasarBody,
): Promise<LeadConSla> {
  return runInTransaction(
    undefined,
    async (tx) => {
      const ahora = new Date();
      const lead = await leadRepository.findById(leadId, tx);
      if (!lead) throw new AppError("lead_no_encontrado", 404, "El lead no existe");
      assertLeadAbierto(lead);

      const motivoDenegacion = canTransfer(usuario, {
        asesorId: lead.asesorId,
        vendedorId: lead.vendedorId,
        etapa: lead.etapa,
      });
      if (motivoDenegacion !== null) throwPorMotivoDenegacion(motivoDenegacion);

      const destino = ROLES_ACCESO_TOTAL.includes(usuario.rol) ? body.vendedorId : undefined;
      const receptorId = await resolveReceptor("VENDEDOR", tx, lead.vendedorId ?? undefined, destino);

      const leadActualizado = await applyAsignacion(
        {
          leadId,
          pool: "VENDEDOR",
          receptorId,
          responsableAnteriorId: lead.vendedorId,
          tipoEvento: "TRASPASO",
          motivo: "traspaso",
          ejecutadoPorId: usuario.id,
          ahora,
        },
        tx,
      );

      return withEstadoSla(leadActualizado, ahora);
    },
    ASIGNACION_TRANSACTION_BOUNDS,
  );
}
