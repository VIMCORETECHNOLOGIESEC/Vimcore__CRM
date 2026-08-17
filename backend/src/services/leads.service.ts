import type { EtapaLead, Lead, Prisma, RolUsuario } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { GESTION_LEAD_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import * as leadEventoRepository from "../repositories/lead-evento.repository.js";
import * as leadRepository from "../repositories/lead.repository.js";
import type { LeadConRelaciones } from "../repositories/lead.repository.js";
import type { ListLeadsQuery, PatchEtapaBody } from "../schemas/leads.schema.js";
import { applyFormulario } from "./formularios.service.js";
import { canEdit, canRead, type UsuarioAcceso } from "./leads.access.js";
import { calculateEstadoSla, type EstadoSla, slaFilterBoundaries } from "./sla.calculator.js";

const ROLES_ACCESO_TOTAL: readonly RolUsuario[] = ["ADMINISTRADOR", "SUPERVISOR"];
const ETAPAS_TERMINALES: readonly EtapaLead[] = ["VENTA", "NO_VENTA"];

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
 */
function buildWhere(usuario: UsuarioAcceso, query: ListLeadsQuery, ahora: Date): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};

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
 * VENTA/NO_VENTA (D6): el semáforo se fija directo (VERDE/ROJO) sin invocar
 * el motor de puntuación — `applyFormulario` (PR2) rechaza estas etapas por
 * diseño (ver `formularios.service.ts`). NUEVO/CONTACTADO/CITA sí pasan por
 * `applyFormulario`, que ya emite su propio `CAMBIO_SEMAFORO` (D17) dentro de
 * la misma `tx` cuando el color cambia — este servicio no lo duplica.
 */
export async function transitionEtapa(
  usuario: UsuarioAcceso,
  id: string,
  body: PatchEtapaBody,
): Promise<Lead> {
  return runInTransaction(
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

      const datosEtapa: Parameters<typeof leadRepository.updateEtapa>[1] = { etapa: body.etapa };

      if (body.etapa === "VENTA" || body.etapa === "NO_VENTA") {
        const semaforoNuevo = body.etapa === "VENTA" ? "VERDE" : "ROJO";
        await leadRepository.updateSemaforo(id, { semaforo: semaforoNuevo }, tx);
        if (lead.semaforo !== semaforoNuevo) {
          await leadEventoRepository.createEvento(
            {
              leadId: id,
              tipo: "CAMBIO_SEMAFORO",
              semaforoAnterior: lead.semaforo,
              semaforoNuevo,
            },
            tx,
          );
        }

        datosEtapa.cerradoEn = new Date();
        if (body.etapa === "VENTA") {
          datosEtapa.montoVenta = body.montoVenta;
          datosEtapa.productoServicio = body.productoServicio;
          datosEtapa.formaPago = body.formaPago;
        } else {
          datosEtapa.observacionCierre = body.observacionCierre;
        }
      } else {
        // NUEVO/CONTACTADO/CITA: calificable — DD4, seam compuesto de PR2.
        await applyFormulario(lead, body.respuestas, usuario.id, tx);
      }

      const leadActualizado = await leadRepository.updateEtapa(id, datosEtapa, tx);

      await leadEventoRepository.createEvento(
        {
          leadId: id,
          tipo: "CAMBIO_ETAPA",
          etapaAnterior: lead.etapa,
          etapaNueva: body.etapa,
        },
        tx,
      );

      return leadActualizado;
    },
    GESTION_LEAD_TRANSACTION_BOUNDS,
  );
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
