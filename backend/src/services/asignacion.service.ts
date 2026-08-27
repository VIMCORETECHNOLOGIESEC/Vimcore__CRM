import { randomUUID } from "node:crypto";
import type { EtapaLead, Lead, Notificacion, Prisma, RolUsuario } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { logger } from "../lib/logger.js";
import { ASIGNACION_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import { registrarBridgeLog } from "./bridge-log.service.js";
import * as leadEventoRepository from "../repositories/lead-evento.repository.js";
import * as leadRepository from "../repositories/lead.repository.js";
import type { PoolAsignacion } from "../repositories/lead.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";
import type {
  AsignarBody,
  AsignarLoteBody,
  ReasignarBody,
  TraspasarBody,
} from "../schemas/leads.schema.js";
import { canReassign, canTransfer, type MotivoDenegacion, type UsuarioAcceso } from "./leads.access.js";
import * as shadowAuthorizationService from "./shadow-authorization.service.js";
import type { LeadConSla } from "./leads.service.js";
import { calculateEstadoSla } from "./sla.calculator.js";
import * as notificacionRepository from "../repositories/notificacion.repository.js";
import { createForActiveSupervisorsAndAdmins } from "./notificaciones.service.js";
import { notificationEvents, publishCommittedEvents, type CommittedEvent } from "./committed-events.service.js";
import { scheduleMetricasBroadcast } from "../lib/metricas-broadcast.js";

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
  | "sla_vencido"
  /**
   * M2 (baja lógica con reasignación obligatoria de cartera activa): un lead
   * de la cartera de un usuario dado de baja se reasigna (pool ASESOR,
   * `tipoEvento REASIGNACION`) o traspasa (pool VENDEDOR, `tipoEvento
   * TRASPASO`) a otro candidato activo del mismo pool — distinto de
   * "reasignacion"/"traspaso" manuales porque `ejecutadoPorId` es siempre
   * `null` (nadie lo ejecutó a mano, lo disparó la baja) y el motivo real de
   * negocio es la baja, no una decisión operativa sobre ESE lead puntual.
   */
  | "baja_usuario";

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
 * D11 (diseño M6): el ÚNICO punto de escritura compartido por los cuatro
 * caminos de asignación de ESTE archivo, más el quinto camino de M2 (baja
 * lógica con reasignación obligatoria de cartera, `usuarios.service.ts`).
 * Tres escrituras atómicas, juntas o ninguna — todo dentro del `tx` del
 * llamador, nunca abre una transacción propia:
 *   1. `leads` — responsable (asesorId/vendedorId según `pool`) + `slaInicioEn`.
 *   2. `usuarios.ultima_asignacion_en` del receptor (D10).
 *   3. `lead_eventos` del tipo correspondiente (bitácora inmutable, D-lead_eventos).
 *
 * Exportada (M2): antes era interna a este archivo; `usuarios.service.ts`
 * la reutiliza en vez de duplicar las tres escrituras atómicas.
 */
export async function applyAsignacion(
  input: ApplyAsignacionInput,
  tx: Prisma.TransactionClient,
): Promise<{ lead: Lead; events: CommittedEvent[] }> {
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

  const tipo = input.tipoEvento === "TRASPASO" ? "LEAD_TRASPASADO" : "LEAD_ASIGNADO";
  const notification = await notificacionRepository.createNotificacion({ usuarioId: input.receptorId, tipo, titulo: input.tipoEvento === "TRASPASO" ? "Lead traspasado" : "Lead asignado", mensaje: "Tenés un nuevo lead a cargo", leadId: input.leadId }, tx);
  // M9 (docs/08-dashboard-kpis.md §5): "asignación" — el hook de métricas NO
  // se llama acá: `applyAsignacion` corre dentro de la `tx` del llamador y
  // esa transacción puede todavía hacer rollback (p. ej. dentro del loop de
  // reasignación de cartera de `usuarios.service.ts::deactivateUsuario`, si
  // un paso posterior de la misma transacción falla). `scheduleMetricasBroadcast`
  // se llama en cada CALLER externo de `applyAsignacion`, después del commit,
  // en el mismo lugar donde cada uno ya llama `publishCommittedEvents`.
  return { lead, events: [...notificationEvents(notification), { userId: input.receptorId, type: "lead.asignado", data: { leadId: input.leadId, responsableId: input.receptorId } }] };
}

export interface ApplyAsignacionesEnLoteEntrada {
  leadId: string;
  receptorId: string;
  responsableAnteriorId: string | null;
}

interface ApplyAsignacionesEnLoteOpciones {
  pool: PoolAsignacion;
  tipoEvento: "ASIGNACION" | "REASIGNACION" | "TRASPASO";
  motivo: MotivoAsignacion;
  ejecutadoPorId: string | null;
  ahora: Date;
}

/**
 * Fix bulk writes (`deactivateUsuario`, M2): variante en lote de
 * `applyAsignacion` para reasignaciones de cartera masivas — reduce el
 * número de escrituras de O(cartera) a O(candidatos activos del pool),
 * agrupando las 4 escrituras de `applyAsignacion` por RECEPTOR en vez de
 * ejecutarlas una vez por lead. No reemplaza `applyAsignacion`: los otros
 * callers (`assignLead`/`reassignLead`/`transferLead`/`assignAutomatically`,
 * que siempre operan sobre UN lead) siguen usando la versión singular sin
 * cambios.
 *
 * Devuelve el array de `CommittedEvent[]` en el MISMO orden que `entradas`
 * (determinismo del orden de eventos SSE, igual que si se hubiera llamado
 * `applyAsignacion` una vez por entrada).
 */
export async function applyAsignacionesEnLote(
  entradas: readonly ApplyAsignacionesEnLoteEntrada[],
  opciones: ApplyAsignacionesEnLoteOpciones,
  tx: Prisma.TransactionClient,
): Promise<CommittedEvent[]> {
  if (entradas.length === 0) return [];

  const { pool, tipoEvento, motivo, ejecutadoPorId, ahora } = opciones;

  const leadIdsPorReceptor = new Map<string, string[]>();
  for (const entrada of entradas) {
    const existentes = leadIdsPorReceptor.get(entrada.receptorId);
    if (existentes) {
      existentes.push(entrada.leadId);
    } else {
      leadIdsPorReceptor.set(entrada.receptorId, [entrada.leadId]);
    }
  }

  for (const [receptorId, leadIds] of leadIdsPorReceptor) {
    await leadRepository.assignResponsableBulk(
      leadIds,
      { pool, responsableId: receptorId, slaInicioEn: ahora },
      tx,
    );
  }

  await usuarioRepository.updateUltimaAsignacionBulk(
    [...leadIdsPorReceptor.keys()],
    ahora,
    tx,
  );

  const eventosData: leadEventoRepository.CreateEventoData[] = entradas.map((entrada) => {
    const detalle: DetalleEventoAsignacion = {
      version: 1,
      requiereNotificacion: false,
      motivo,
      responsableId: entrada.receptorId,
      responsableAnteriorId: entrada.responsableAnteriorId,
      ejecutadoPorId,
    };
    return {
      leadId: entrada.leadId,
      tipo: tipoEvento,
      usuarioId: ejecutadoPorId ?? undefined,
      detalle: detalle as unknown as Prisma.InputJsonValue,
    };
  });
  await leadEventoRepository.createEventos(eventosData, tx);

  const tipoNotificacion = tipoEvento === "TRASPASO" ? "LEAD_TRASPASADO" : "LEAD_ASIGNADO";
  const tituloNotificacion = tipoEvento === "TRASPASO" ? "Lead traspasado" : "Lead asignado";

  const notificacionesData: notificacionRepository.CreateNotificacionBulkData[] = entradas.map((entrada) => ({
    id: randomUUID(),
    usuarioId: entrada.receptorId,
    tipo: tipoNotificacion,
    titulo: tituloNotificacion,
    mensaje: "Tenés un nuevo lead a cargo",
    leadId: entrada.leadId,
    canal: "IN_APP",
    creadaEn: ahora,
  }));
  await notificacionRepository.createNotificaciones(notificacionesData, tx);

  return entradas.flatMap((entrada, index) => {
    const notificacionData = notificacionesData[index] as notificacionRepository.CreateNotificacionBulkData;
    const notification: Notificacion = {
      id: notificacionData.id,
      usuarioId: notificacionData.usuarioId,
      tipo: notificacionData.tipo,
      canal: notificacionData.canal,
      titulo: notificacionData.titulo,
      mensaje: notificacionData.mensaje,
      leadId: notificacionData.leadId ?? null,
      leidaEn: null,
      creadaEn: notificacionData.creadaEn,
    };
    return [
      ...notificationEvents(notification),
      {
        userId: entrada.receptorId,
        type: "lead.asignado",
        data: { leadId: entrada.leadId, responsableId: entrada.receptorId },
      },
    ];
  });
}

/**
 * D1 (diseño M6, revisado por D-A2 revisión 2) — el motor de asignación
 * automática. Nunca abre transacción propia: desde F3/F4 recibe la `tx`
 * viva de `asignacion.service::assignAfterCommit` (antes recibía la `tx` de
 * `ingesta.service::procesarEnTransaccion` — ver nota en ese archivo, la
 * invariante "nunca abre su propia transacción" se preserva, solo cambió
 * QUIÉN abre la transacción externa). Sin candidatos activos del pool
 * `ASESOR`, el lead queda intacto (`asesorId`/`slaInicioEn` siguen `null`,
 * D3) y solo se escribe un evento `SIN_ASIGNAR` con `requiereNotificacion:
 * true` (D5/D6) para que M8 lo consuma.
 *
 * Guarda de idempotencia OBLIGATORIA (D-A2 revisión 2, no opcional): si el
 * lead ya tiene `asesorId` no-nulo, no-opea en silencio sin escribir ningún
 * evento. Cubre dos casos reales que el disparo dentro-de-la-transacción de
 * ingesta no necesitaba cubrir: (1) un Supervisor asigna a mano en la
 * ventana entre el commit de ingesta y el intento automático post-commit;
 * (2) un reintento de `assignAfterCommit` cuyo intento anterior sí llegó a
 * confirmar pero cuya excepción se disparó después (p. ej. al reportar el
 * resultado) — el reintento ve el lead ya asignado y no duplica asignación
 * ni evento.
 */
export async function assignAutomatically(
  leadId: string,
  ahora: Date,
  tx: Prisma.TransactionClient,
): Promise<CommittedEvent[]> {
  const leadActual = await leadRepository.findById(leadId, tx);
  if (leadActual === null || leadActual.asesorId !== null) return [];

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
    // Bloque C (D5): `empresaId` explícito null (holding-wide) — este call
    // site queda fuera del alcance de Fase 1 / Stage 1 (sdd/bloque-c-aislamiento);
    // conectar el `empresaId` real del lead queda como seguimiento.
    const notifications = await createForActiveSupervisorsAndAdmins({ tipo: "LEAD_SIN_ASIGNAR", titulo: "Lead sin asignar", mensaje: "No hay asesores activos disponibles", leadId }, null, tx);
    return notifications.flatMap(notificationEvents);
  }

  const assigned = await applyAsignacion(
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
  return assigned.events;
}

/** D-A2 (revisión 2): 3 intentos, backoff 250ms/1000ms, presupuesto total <=5s. */
const ASIGNACION_POST_COMMIT_MAX_INTENTOS = 3;
const ASIGNACION_POST_COMMIT_BACKOFF_MS: readonly number[] = [250, 1000];

/**
 * D5 (diseño M6, revisión F3/F4) — detalle del evento de fallo POST-COMMIT.
 * NO reusa `DetalleEventoAsignacion`: `SIN_ASIGNAR` significa "no había
 * candidatos activos" (estado de negocio, M8 lo notifica); esto significa
 * "la asignación automática agotó sus reintentos por una excepción real"
 * (incidente de infraestructura/operación). Sobrecargar `SIN_ASIGNAR`
 * ocultaría el incidente y dispararía una notificación falsa al Supervisor.
 */
export interface DetalleEventoAsignacionFallida {
  version: 1;
  requiereNotificacion: true;
  motivo: "fallo_asignacion_postcommit";
  intentos: number;
  errorFinal: string;
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * D-A2 (diseño, revisión 2) — seam invocado por `ingesta.service.ts`
 * DESPUÉS de que la transacción de ingesta ya hizo commit, nunca antes
 * (ver nota D1 arriba y la de `ingesta.service.ts::procesarEnTransaccion`).
 * Abre su PROPIA transacción por intento (`ASIGNACION_TRANSACTION_BOUNDS` —
 * el mismo bound que `assignLead`/`reassignLead`/`transferLead`: "flujo de
 * escritura propio"; `assignAutomatically` en sí sigue sin abrir
 * transacción, D1 se preserva). Reintenta hasta
 * `ASIGNACION_POST_COMMIT_MAX_INTENTOS` veces ante CUALQUIER excepción
 * lanzada, con backoff `ASIGNACION_POST_COMMIT_BACKOFF_MS` entre intentos, y
 * **nunca lanza** hacia el llamador — un fallo aquí no puede convertirse en
 * un 500 del webhook de ingesta: el reintento del bridge ante un 5xx
 * entraría por `ON CONFLICT` de `upsertLeadRecibido` y cortocircuitaría como
 * `duplicado: true` sin volver a intentar la asignación (no repararía nada,
 * solo reportaría un fallo de ingesta falso).
 *
 * "Sin candidatos" NO es un fallo reintentable: `assignAutomatically`
 * escribe `SIN_ASIGNAR` y retorna normalmente (sin lanzar), así que el
 * bucle de abajo solo reintenta ante una excepción real — un único intento
 * cubre ese camino.
 */
export async function assignAfterCommit(leadId: string, ahora: Date): Promise<void> {
  let ultimoError: unknown;

  for (let intento = 1; intento <= ASIGNACION_POST_COMMIT_MAX_INTENTOS; intento++) {
    try {
      const events = await runInTransaction(
        undefined,
        (tx) => assignAutomatically(leadId, ahora, tx),
        ASIGNACION_TRANSACTION_BOUNDS,
      );
      publishCommittedEvents(events);
      // M9 (docs/08-dashboard-kpis.md §5): post-commit, mismo lugar que
      // `publishCommittedEvents` — la `tx` de este intento ya confirmó.
      scheduleMetricasBroadcast();
      return;
    } catch (error) {
      ultimoError = error;
      const quedanReintentos = intento < ASIGNACION_POST_COMMIT_MAX_INTENTOS;
      if (quedanReintentos) {
        await waitMs(ASIGNACION_POST_COMMIT_BACKOFF_MS[intento - 1] as number);
      }
    }
  }

  await recordAssignmentDegradation(leadId, ASIGNACION_POST_COMMIT_MAX_INTENTOS, ultimoError);
}

/**
 * D-A2 (diseño, revisión 2) — cascada degradante tras agotar los reintentos.
 * Cada paso es best-effort y corre en su propio `try/catch` fuera de
 * cualquier transacción viva (mismo criterio que `registrarLogSeguro` de
 * `ingesta.service.ts`, DD5/M4): un fallo al reportar el incidente nunca
 * debe enmascarar ni interrumpir el reporte de los pasos siguientes.
 *   1. `lead_eventos` tipo `ASIGNACION_FALLIDA` — canal futuro de M8.
 *   2. `bridge_logs` ERROR — canal de operador interino (M8 no existe aún).
 *   3. `logger.error` estructurado — último recurso si la BD está caída.
 */
async function recordAssignmentDegradation(
  leadId: string,
  intentos: number,
  ultimoError: unknown,
): Promise<void> {
  const errorFinal = ultimoError instanceof Error ? ultimoError.message : "Error desconocido";

  try {
    const detalle: DetalleEventoAsignacionFallida = {
      version: 1,
      requiereNotificacion: true,
      motivo: "fallo_asignacion_postcommit",
      intentos,
      errorFinal,
    };
    await leadEventoRepository.createEvento({
      leadId,
      tipo: "ASIGNACION_FALLIDA",
      detalle: detalle as unknown as Prisma.InputJsonValue,
    });
  } catch (error) {
    logger.error({ err: error, leadId }, "asignacion: fallo al registrar evento ASIGNACION_FALLIDA");
  }

  try {
    await registrarBridgeLog({
      bridgeId: null,
      nivel: "ERROR",
      mensaje: `Asignación automática post-commit agotó ${intentos} intentos para el lead ${leadId}`,
      payload: { leadId, intentos, errorFinal },
    });
  } catch (error) {
    logger.error({ err: error, leadId }, "asignacion: fallo al registrar bridge_logs ERROR");
  }

  logger.error(
    { leadId, intentos, errorFinal },
    "asignacion: agotados los reintentos de asignación automática post-commit",
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
function throwForMotivoDenegacion(motivo: MotivoDenegacion): never {
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
  const result = await runInTransaction(
    undefined,
    async (tx) => {
      const ahora = new Date();
      const lead = await leadRepository.findById(leadId, tx);
      if (!lead) throw new AppError("lead_no_encontrado", 404, "El lead no existe");
      assertLeadAbierto(lead);

      const destino = ROLES_ACCESO_TOTAL.includes(usuario.rol) ? body.asesorId : undefined;
      const receptorId = await resolveReceptor("ASESOR", tx, lead.asesorId ?? undefined, destino);

      const assigned = await applyAsignacion(
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

      return { lead: withEstadoSla(assigned.lead, ahora), events: assigned.events };
    },
    ASIGNACION_TRANSACTION_BOUNDS,
  );
  publishCommittedEvents(result.events);
  // M9 (docs/08-dashboard-kpis.md §5): post-commit, mismo lugar que
  // `publishCommittedEvents` — la `tx` de arriba ya confirmó.
  scheduleMetricasBroadcast();
  return result.lead;
}

export interface ResultadoLoteExitoso {
  leadId: string;
  asesorId: string;
}

export interface ResultadoLoteFallido {
  leadId: string;
  codigo: string;
  mensaje: string;
}

export interface ResultadoAsignacionLote {
  exitosos: ResultadoLoteExitoso[];
  fallidos: ResultadoLoteFallido[];
  resumen: { solicitados: number; exitosos: number; fallidos: number };
}

/**
 * `POST /api/v1/leads/asignar-lote` (diseño D-A1). N llamadas SECUENCIALES a
 * `assignLead` — nunca `Promise.all` ni un `$transaction` único sobre los N
 * leads (ver tabla de opciones del diseño): `Promise.all` haría que
 * `selectResponsable` lea cargas obsoletas entre llamadas concurrentes
 * (apilaría leads en el mismo asesor), y un único `$transaction` sería
 * all-or-nothing, contradiciendo el requisito de reporte por lead. Cada
 * llamada reusa el ÚNICO punto de escritura/autorización ya probado de
 * `assignLead` — cero lógica de negocio nueva.
 *
 * Solo `AppError` se captura por lead (`lead_no_encontrado`, `lead_cerrado`,
 * `destinatario_invalido`, `sin_candidatos`, `permiso_denegado`). Un error
 * NO-`AppError` (infra: conexión caída, etc.) se relanza y aborta el
 * request completo — un fallo de infraestructura no debe reportarse como
 * "estos leads son inválidos".
 */
export async function assignLeadsBatch(
  usuario: UsuarioAcceso,
  body: AsignarLoteBody,
): Promise<ResultadoAsignacionLote> {
  const exitosos: ResultadoLoteExitoso[] = [];
  const fallidos: ResultadoLoteFallido[] = [];

  for (const leadId of body.leadIds) {
    try {
      const lead = await assignLead(usuario, leadId, { asesorId: body.asesorId });
      exitosos.push({ leadId, asesorId: lead.asesorId as string });
    } catch (error) {
      if (error instanceof AppError) {
        fallidos.push({ leadId, codigo: error.code, mensaje: error.message });
        continue;
      }
      throw error;
    }
  }

  return {
    exitosos,
    fallidos,
    resumen: { solicitados: body.leadIds.length, exitosos: exitosos.length, fallidos: fallidos.length },
  };
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
  const result = await runInTransaction(
    undefined,
    async (tx) => {
      const ahora = new Date();
      const lead = await leadRepository.findById(leadId, tx);
      if (!lead) throw new AppError("lead_no_encontrado", 404, "El lead no existe");
      assertLeadAbierto(lead);

      const leadReasignacion = {
        asesorId: lead.asesorId,
        vendedorId: lead.vendedorId,
        semaforo: lead.semaforo,
      };
      const motivoDenegacion = canReassign(usuario, leadReasignacion);
      // Bloque B (Fase 2, "Shadow authorizer call sites"): fire-and-forget,
      // corre para ambos desenlaces (permitido y denegado), nunca bloquea ni
      // demora esta transacción.
      void shadowAuthorizationService.compareCanReassign(usuario.id, leadReasignacion, motivoDenegacion);
      if (motivoDenegacion !== null) throwForMotivoDenegacion(motivoDenegacion);

      const destino = ROLES_ACCESO_TOTAL.includes(usuario.rol) ? body.asesorId : undefined;
      const receptorId = await resolveReceptor("ASESOR", tx, lead.asesorId ?? undefined, destino);

      const assigned = await applyAsignacion(
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

      return { lead: withEstadoSla(assigned.lead, ahora), events: assigned.events };
    },
    ASIGNACION_TRANSACTION_BOUNDS,
  );
  publishCommittedEvents(result.events);
  // M9 (docs/08-dashboard-kpis.md §5): post-commit, mismo lugar que
  // `publishCommittedEvents` — la `tx` de arriba ya confirmó.
  scheduleMetricasBroadcast();
  return result.lead;
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
  const result = await runInTransaction(
    undefined,
    async (tx) => {
      const ahora = new Date();
      const lead = await leadRepository.findById(leadId, tx);
      if (!lead) throw new AppError("lead_no_encontrado", 404, "El lead no existe");
      assertLeadAbierto(lead);

      const leadTraspaso = {
        asesorId: lead.asesorId,
        vendedorId: lead.vendedorId,
        etapa: lead.etapa,
      };
      const motivoDenegacion = canTransfer(usuario, leadTraspaso);
      // Bloque B (Fase 2, "Shadow authorizer call sites"): fire-and-forget,
      // corre para ambos desenlaces, nunca bloquea ni demora esta transacción.
      void shadowAuthorizationService.compareCanTransfer(usuario.id, leadTraspaso, motivoDenegacion);
      if (motivoDenegacion !== null) throwForMotivoDenegacion(motivoDenegacion);

      const destino = ROLES_ACCESO_TOTAL.includes(usuario.rol) ? body.vendedorId : undefined;
      const receptorId = await resolveReceptor("VENDEDOR", tx, lead.vendedorId ?? undefined, destino);

      const assigned = await applyAsignacion(
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

      return { lead: withEstadoSla(assigned.lead, ahora), events: assigned.events };
    },
    ASIGNACION_TRANSACTION_BOUNDS,
  );
  publishCommittedEvents(result.events);
  // M9 (docs/08-dashboard-kpis.md §5): post-commit, mismo lugar que
  // `publishCommittedEvents` — la `tx` de arriba ya confirmó.
  scheduleMetricasBroadcast();
  return result.lead;
}

