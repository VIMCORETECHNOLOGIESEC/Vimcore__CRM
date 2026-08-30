import type { EtapaLead, Lead, Prisma, RedSocial, RolUsuario } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { GESTION_LEAD_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import * as leadEventoRepository from "../repositories/lead-evento.repository.js";
import * as leadRepository from "../repositories/lead.repository.js";
import type { LeadConRelaciones } from "../repositories/lead.repository.js";
import type { ListLeadsQuery, PatchEtapaBody } from "../schemas/leads.schema.js";
import { applyFormulario } from "./formularios.service.js";
import { aplicarFiltroEmpresa, canEdit, canRead, type UsuarioAcceso } from "./leads.access.js";
import { calculateEstadoSla, type EstadoSla, slaFilterBoundaries } from "./sla.calculator.js";
import { publishCommittedEvents } from "./committed-events.service.js";
import { scheduleMetricasBroadcast } from "../lib/metricas-broadcast.js";

/**
 * Bloque F (aditivo, decisión cerrada con el usuario): mismo criterio que
 * `oportunidad.access.ts`/`asignacion.service.ts` — constante LOCAL de este
 * archivo (usada solo por `buildWhere` para el scoping de listado, nunca por
 * `canEdit`/`canRead`, que viven en `leads.access.ts`), así que agregar los
 * dos roles nuevos acá no toca ninguna autorización fuera de este archivo.
 */
const ROLES_ACCESO_TOTAL: readonly RolUsuario[] = [
  "ADMINISTRADOR",
  "SUPERVISOR",
  "SUPERVISOR_HOLDING",
  "SUPER_ADMIN",
];
const ETAPAS_TERMINALES: readonly EtapaLead[] = ["VENTA", "NO_VENTA"];

/**
 * docs/02-reglas-negocio.md §6: progreso lineal hacia adelante entre etapas
 * no terminales (NUEVO → CONTACTADO → CITA), nunca se retrocede; desde
 * cualquier etapa no terminal se permite el salto directo a cierre (VENTA o
 * NO_VENTA). Copia server-side de `frontend/src/funcionalidades/leads/etapas.ts::TRANSICIONES_VALIDAS`
 * — mismo criterio que `ETAPAS_TERMINALES` arriba: no compartida, replicada
 * a propósito en este archivo.
 */
const TRANSICIONES_VALIDAS: Record<EtapaLead, readonly EtapaLead[]> = {
  NUEVO: ["CONTACTADO", "VENTA", "NO_VENTA"],
  CONTACTADO: ["CITA", "VENTA", "NO_VENTA"],
  CITA: ["VENTA", "NO_VENTA"],
  VENTA: [],
  NO_VENTA: [],
};

export type LeadConSla = Lead & { estadoSla: EstadoSla };
/**
 * spec ("Respuesta enriquecida con relaciones"): forma real de `findLeads`/
 * `findLeadById` desde que `lead.repository.ts::findById`/`findMany`
 * incluyen `cliente`/`asesor`/`vendedor`. `LeadConSla` (arriba) se conserva
 * sin tocar — `asignacion.service.ts` la importa y mantiene su propio
 * `withEstadoSla` local sobre `Lead` plano (comentario en ese archivo: "no se
 * modifica ese archivo").
 */
export type LeadDetalleConSla = LeadConRelaciones & { estadoSla: EstadoSla };

/**
 * Genérica en `T` a propósito: preserva la forma exacta de entrada (`Lead`
 * plano o `LeadConRelaciones`) y solo añade `estadoSla` — así `findLeads`/
 * `findLeadById` obtienen `LeadDetalleConSla` sin un segundo helper duplicado.
 */
function withEstadoSla<T extends Lead>(lead: T, ahora: Date): T & { estadoSla: EstadoSla } {
  return { ...lead, estadoSla: calculateEstadoSla(lead.slaInicioEn, lead.cerradoEn, ahora) };
}

/**
 * DD5 (diseño M5): el `where` de rol se construye aquí a partir de
 * `req.user`, nunca desde el query string — spec "Query param no sobrescribe
 * el filtro de rol".
 *
 * Bloque C (Fase 2/Stage 2, D4/spec "Blocking empresa scoping on lead
 * paths"): `usuario.empresaId === null` (holding-wide, D2) no agrega
 * restricción; cualquier otro valor filtra por esa empresa exacta,
 * independiente del rol — vía `leads.access.ts::aplicarFiltroEmpresa`
 * (task 2.12 REFACTOR: mismo helper que `metricas.access.ts::resolveAlcanceBase`,
 * antes duplicado).
 */
function buildWhere(usuario: UsuarioAcceso, query: ListLeadsQuery, ahora: Date): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = aplicarFiltroEmpresa({}, usuario);

  if (!ROLES_ACCESO_TOTAL.includes(usuario.rol)) {
    where.OR = [{ asesorId: usuario.id }, { vendedorId: usuario.id }];
  } else if (query.responsableId) {
    where.OR = [{ asesorId: query.responsableId }, { vendedorId: query.responsableId }];
  }

  if (query.etapa) where.etapa = query.etapa;

  // D14: "sin_calificar" es el cuarto valor de filtro explícito de semaforo.
  if (query.semaforo === "sin_calificar") {
    where.semaforo = null;
  } else if (query.semaforo) {
    where.semaforo = query.semaforo;
  }

  if (query.redSocial) where.redSocial = query.redSocial;

  // DD2: filtro de campaña contra el jsonb crudo de M4.
  if (query.campania) {
    where.payloadOriginal = {
      path: ["nombreCampania"],
      string_contains: query.campania,
      mode: "insensitive",
    };
  }

  if (query.desde || query.hasta) {
    where.ingresadoEn = {
      ...(query.desde ? { gte: query.desde } : {}),
      ...(query.hasta ? { lte: query.hasta } : {}),
    };
  }

  // M-hardening Bloque A (WU8, spec lead-listing): aplicado ANTES del bloque
  // `estadoSla` de abajo — ese bloque también escribe `cerradoEn` (siempre
  // `null` para cualquier valor de `estadoSla`, D6 de M6), así que el orden
  // determina cuál gana si ambos coexistieran. El schema (`D7`,
  // `leads.schema.ts`) ya rechaza `vista=cerrados` + `estadoSla` antes de
  // llegar acá, así que en la práctica nunca compiten por la misma escritura.
  if (query.vista === "activos") {
    where.cerradoEn = null;
  } else if (query.vista === "cerrados") {
    where.cerradoEn = { not: null };
  }

  // DD6: fronteras precomputadas, comparadas contra `sla_inicio_en`, nunca
  // recalculadas columna por columna. Acotado a `cerrado_en IS NULL` — forma
  // exacta del índice parcial `idx_leads_sla` (D11).
  if (query.estadoSla) {
    where.cerradoEn = null;
    if (query.estadoSla === "sin_iniciar") {
      where.slaInicioEn = null;
    } else {
      const fronteras = slaFilterBoundaries(ahora);
      if (query.estadoSla === "a_tiempo") {
        where.slaInicioEn = { gt: fronteras.fronteraRiesgo };
      } else if (query.estadoSla === "en_riesgo") {
        where.slaInicioEn = { gt: fronteras.fronteraAtrasado, lte: fronteras.fronteraRiesgo };
      } else {
        where.slaInicioEn = { lte: fronteras.fronteraAtrasado };
      }
    }
  }

  return where;
}

export interface FindLeadsResult {
  leads: LeadDetalleConSla[];
  total: number;
  pagina: number;
  limite: number;
}

export async function findLeads(usuario: UsuarioAcceso, query: ListLeadsQuery): Promise<FindLeadsResult> {
  const ahora = new Date();
  const where = buildWhere(usuario, query, ahora);

  const { leads, total } = await leadRepository.findMany(where, {
    skip: (query.pagina - 1) * query.limite,
    take: query.limite,
    orderBy: { ingresadoEn: query.direccion },
    busqueda: query.busqueda,
  });

  return {
    leads: leads.map((lead) => withEstadoSla(lead, ahora)),
    total,
    pagina: query.pagina,
    limite: query.limite,
  };
}

/**
 * `GET /leads/catalogo/redes-sociales` (catálogo en cascada, reemplaza
 * `GET /bridges/redes-activas` como fuente del filtro "Red social" en
 * `/leads`): reutiliza `buildWhere` — mismo scoping por rol (D4) y mismos
 * demás filtros ya activos en pantalla (etapa, semáforo, campaña, rango de
 * fechas, estado de SLA, búsqueda) — para que el catálogo se recalcule en
 * cascada con el resto de filtros. `redSocial` se descarta explícitamente del
 * query ANTES de construir el `where`: si el usuario ya filtró por
 * `redSocial=GOOGLE_FORMS`, igual queremos ofrecer esa opción en el catálogo,
 * no que el propio filtro activo la haga desaparecer de sus propias opciones.
 */
export async function listRedesSocialesVisibles(
  usuario: UsuarioAcceso,
  query: ListLeadsQuery,
): Promise<RedSocial[]> {
  const where = buildWhere(usuario, { ...query, redSocial: undefined }, new Date());
  return leadRepository.listRedesSocialesDistintas(where, query.busqueda);
}

/**
 * spec ("Detalle con verificación de acceso"): 404 si no existe, 403 si el
 * usuario no tiene `canRead` — el asesor que traspasó un lead conserva
 * lectura (D4).
 */
export async function findLeadById(usuario: UsuarioAcceso, id: string): Promise<LeadDetalleConSla> {
  const lead = await leadRepository.findById(id);
  if (!lead) throw new AppError("lead_no_encontrado", 404, "El lead no existe");
  if (!canRead(usuario, lead)) {
    throw new AppError("permiso_denegado", 403, "No tienes acceso a este lead");
  }
  return withEstadoSla(lead, new Date());
}

/**
 * spec ("Transición de etapa transaccional"): una única transacción —
 * validación de acceso, validación/cálculo de formulario, actualización de
 * `Lead`, e inserción en `lead_eventos` (D3). Solo `canEdit` puede ejecutarla
 * (D4); una etapa terminal ya cerrada nunca se reabre (D5).
 *
 * VENTA/NO_VENTA (D6, RETIRADO — batch de negociación Bloque D): este
 * endpoint YA NO cierra negociaciones. `canClose`/`leads.access.ts` quedan
 * SUPERSEDIDOS por `oportunidad.access.ts::canCerrarOportunidad` (D7) —
 * criterio de salida esencial de Bloque D ("la autoridad de cierre usa
 * Membresia... no depende de Usuario.rol"). Ver el `throw` explícito dentro
 * de la rama VENTA/NO_VENTA más abajo, que reemplaza por completo el cierre
 * que este comentario describía. GAP DE FRONTEND (reportado, no resuelto en
 * este batch — fuera de alcance backend): el formulario real de cierre en
 * frontend puede seguir apuntando a este endpoint; debe migrar a
 * `POST /oportunidades/:id/cerrar` antes de desplegar este cambio.
 * NUEVO/CONTACTADO/CITA sí pasan por `applyFormulario`, que ya emite su
 * propio `CAMBIO_SEMAFORO` (D17) dentro de la misma `tx` cuando el color
 * cambia — este servicio no lo duplica. Sin cambios en esa rama.
 */
export async function transitionEtapa(
  usuario: UsuarioAcceso,
  id: string,
  body: PatchEtapaBody,
): Promise<Lead> {
  const result = await runInTransaction(
    undefined,
    async (tx) => {
      const lead = await leadRepository.findById(id, tx);
      if (!lead) throw new AppError("lead_no_encontrado", 404, "El lead no existe");
      if (!canEdit(usuario, lead)) {
        throw new AppError("permiso_denegado", 403, "No tienes permiso para modificar este lead");
      }
      if (ETAPAS_TERMINALES.includes(lead.etapa)) {
        throw new AppError(
          "etapa_terminal",
          409,
          `El lead ya está en una etapa terminal (${lead.etapa}) y no puede reabrirse`,
        );
      }
      if (!TRANSICIONES_VALIDAS[lead.etapa].includes(body.etapa)) {
        throw new AppError(
          "transicion_invalida",
          409,
          `No se puede pasar de ${lead.etapa} a ${body.etapa}`,
        );
      }

      if (body.etapa === "VENTA" || body.etapa === "NO_VENTA") {
        // Bloque D (batch de negociación, decisión documentada): RETIRADO.
        // Este endpoint ya no cierra negociaciones — la autoridad de cierre
        // vive en `POST /oportunidades/:id/cerrar` (D7), la única fuente de
        // verdad de aquí en adelante. `canClose`/`compareCanClose` ya no se
        // invocan desde esta rama (ver comentario de cabecera de
        // `transitionEtapa` y de `leads.access.ts::canClose`).
        throw new AppError(
          "cierre_via_oportunidad",
          409,
          "El cierre de una negociación ya no se gestiona desde /leads/:id/etapa — usa POST /oportunidades/:id/cerrar sobre la Oportunidad correspondiente",
        );
      }

      const datosEtapa: Parameters<typeof leadRepository.updateEtapa>[1] = { etapa: body.etapa };

      // NUEVO/CONTACTADO/CITA: calificable — DD4, seam compuesto de PR2.
      await applyFormulario(lead, body.respuestas, usuario.id, tx);

      const leadActualizado = await leadRepository.updateEtapa(id, datosEtapa, tx);

      await leadEventoRepository.createEvento(
        {
          leadId: id,
          empresaId: lead.empresaId,
          tipo: "CAMBIO_ETAPA",
          etapaAnterior: lead.etapa,
          etapaNueva: body.etapa,
        },
        tx,
      );

      const recipients = [...new Set([leadActualizado.asesorId, leadActualizado.vendedorId].filter((id): id is string => id !== null))];
      return {
        lead: leadActualizado,
        events: recipients.map((userId) => ({
          userId,
          empresaId: lead.empresaId,
          type: "lead.etapa-cambiada" as const,
          data: { leadId: id, etapaAnterior: lead.etapa, etapaNueva: body.etapa },
        })),
      };
    },
    GESTION_LEAD_TRANSACTION_BOUNDS,
  );
  publishCommittedEvents(result.events);
  // M9 (docs/08-dashboard-kpis.md §5): "cambio de etapa" y "cierre" — una
  // transición a VENTA/NO_VENTA es ambas a la vez, un solo hook alcanza.
  scheduleMetricasBroadcast();
  return result.lead;
}

/**
 * spec ("Recalificación sin cambio de etapa", D16): reutiliza `applyFormulario`
 * (PR2) sobre la etapa ACTUAL del lead, sin transacción externa — nunca toca
 * `leads.etapa` ni escribe `CAMBIO_ETAPA`. Mismo control de acceso que
 * `transitionEtapa` (D4): solo el responsable operativo o Admin/Supervisor.
 */
export async function recalificarLead(
  usuario: UsuarioAcceso,
  id: string,
  respuestas: Record<string, string>,
): Promise<LeadConSla> {
  const lead = await leadRepository.findById(id);
  if (!lead) throw new AppError("lead_no_encontrado", 404, "El lead no existe");
  if (!canEdit(usuario, lead)) {
    throw new AppError("permiso_denegado", 403, "No tienes permiso para modificar este lead");
  }

  const resultado = await applyFormulario(lead, respuestas, usuario.id);

  return withEstadoSla(
    { ...lead, semaforo: resultado.semaforo, puntuacion: resultado.puntuacion },
    new Date(),
  );
}
