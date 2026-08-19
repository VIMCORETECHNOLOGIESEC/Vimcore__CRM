import type { Prisma, RolUsuario } from "@prisma/client";
import type { MetricasQuery } from "../schemas/metricas.schema.js";
import type { UsuarioAcceso } from "./leads.access.js";

const ROLES_ACCESO_TOTAL: readonly RolUsuario[] = ["ADMINISTRADOR", "SUPERVISOR"];

/** docs/08 §1: administrador y supervisor tienen alcance general. */
export function tieneAccesoTotal(usuario: UsuarioAcceso): boolean {
  return ROLES_ACCESO_TOTAL.includes(usuario.rol);
}

/**
 * docs/08 §1 + §4 ("Responsable — Solo administrador y supervisor"): Asesor y
 * Vendedor siempre quedan acotados a sí mismos — `query.responsableId` se
 * IGNORA para ellos (nunca puede escalar a ver la cartera de otro
 * responsable). Admin/Supervisor sin `responsableId` no tienen restricción
 * (`null`); con `responsableId`, se acotan a ese responsable puntual.
 *
 * `null` de retorno = sin restricción por responsable (alcance total).
 */
export function resolveResponsableIds(usuario: UsuarioAcceso, query: MetricasQuery): string[] | null {
  if (!tieneAccesoTotal(usuario)) return [usuario.id];
  if (query.responsableId) return [query.responsableId];
  return null;
}

/**
 * Alcance base compartido por las 7 consultas de M9: rol (vía
 * `resolveResponsableIds`) + red social + campaña — SIN fecha. El campo de
 * fecha a filtrar depende de cada indicador (docs/08 §2.3: "los cerrados se
 * cuentan por fecha de cierre, los ingresados por fecha de ingreso") — se
 * agrega aparte con `aplicarRangoFecha`, nunca acá, para que un mismo helper
 * sirva tanto a los indicadores que filtran por `ingresadoEn` como a los que
 * filtran por `cerradoEn`.
 */
export function resolveAlcanceBase(usuario: UsuarioAcceso, query: MetricasQuery): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};

  const responsableIds = resolveResponsableIds(usuario, query);
  if (responsableIds) {
    where.OR = responsableIds.flatMap((id) => [{ asesorId: id }, { vendedorId: id }]);
  }

  if (query.redSocial) where.redSocial = query.redSocial;

  if (query.campania) {
    where.payloadOriginal = {
      path: ["nombreCampania"],
      string_contains: query.campania,
      mode: "insensitive",
    };
  }

  return where;
}

export type CampoFechaMetrica = "ingresadoEn" | "cerradoEn";

/**
 * Agrega el filtro de fecha al `where` ya resuelto por `resolveAlcanceBase`
 * — separado a propósito (ver comentario de esa función) para que el
 * servicio elija `ingresadoEn`/`cerradoEn` según el indicador.
 */
export function aplicarRangoFecha(
  where: Prisma.LeadWhereInput,
  campo: CampoFechaMetrica,
  desde: Date,
  hasta: Date,
): Prisma.LeadWhereInput {
  return { ...where, [campo]: { gte: desde, lte: hasta } };
}

/**
 * Representación paralela del mismo alcance, para las consultas de M9 que
 * necesitan SQL crudo (correlacionadas contra `lead_eventos`, o `GROUP BY`
 * sobre una expresión JSONB/COALESCE que Prisma no expresa) —
 * `metricas.repository.ts` la consume para armar el `WHERE` a mano.
 * `resolveResponsableIds` es la ÚNICA fuente de la resolución de alcance por
 * rol; esta función y `resolveAlcanceBase` solo la proyectan a dos formatos
 * distintos, nunca la reimplementan.
 */
export interface FiltroLeadsSql {
  responsableIds: string[] | null;
  redSocial: string | null;
  campania: string | null;
  campoFecha: "ingresado_en" | "cerrado_en";
  desde: Date;
  hasta: Date;
}

export function resolveFiltroSql(
  usuario: UsuarioAcceso,
  query: MetricasQuery,
  campoFecha: "ingresado_en" | "cerrado_en",
  desde: Date,
  hasta: Date,
): FiltroLeadsSql {
  return {
    responsableIds: resolveResponsableIds(usuario, query),
    redSocial: query.redSocial ?? null,
    campania: query.campania ?? null,
    campoFecha,
    desde,
    hasta,
  };
}
