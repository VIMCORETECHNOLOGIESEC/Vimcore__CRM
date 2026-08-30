import type { Prisma, RolUsuario } from "@prisma/client";
import type { MetricasQuery } from "../schemas/metricas.schema.js";
import type { UsuarioAcceso } from "./leads.access.js";
import type { RendimientoCampaniaFiltro } from "../repositories/metaAds/campania-metrica-diaria.repository.js";

const ROLES_ACCESO_TOTAL: readonly RolUsuario[] = [
  "ADMINISTRADOR",
  "SUPERVISOR",
  // Bloque F (aditivo): mismo alcance maximo que ADMINISTRADOR, sin atarse a una empresa.
  "SUPERVISOR_HOLDING",
  "SUPER_ADMIN",
];

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
 * Drill-down de empresa (mismo criterio de 3 ramas ya usado en
 * `usuarios.service.ts::buildWhere` y `bridge.service.ts::buildBridgeWhere`):
 * (1) sesión company-scoped: forzada a su propia empresa, `query.empresaId`
 * se ignora (nunca puede escalar a otra empresa); (2) sesión holding-wide con
 * `query.empresaId`: drill-down opcional a UNA empresa puntual del holding;
 * (3) sesión holding-wide sin `query.empresaId`: `null` = sin filtro, ve el
 * agregado de todo el holding (D2/D6, comportamiento previo sin cambios).
 */
export function resolveEmpresaId(usuario: UsuarioAcceso, query: MetricasQuery): string | null {
  if (usuario.empresaId !== null) return usuario.empresaId;
  return query.empresaId ?? null;
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
  // Bloque C (Fase 2/Stage 2, D6 ya resuelto: "supervisor de holding ve
  // métricas de todo el holding, incluye agregados multi-empresa, sin
  // permiso de escritura"): `empresaId === null` (holding-wide, D2) no
  // restringe — el supervisor/administrador ve el agregado de TODAS las
  // empresas del holding, ninguna de otro holding. Un `empresaId` concreto
  // (futuro supervisor de empresa, D5/D6 cutover de autoridad, fuera de
  // Bloque C) queda acotado a esa única empresa. `metricas.routes.ts` no
  // expone ningún endpoint de escritura — "sin permiso de escritura" se
  // satisface por construcción (módulo 100% GET), no requiere un chequeo
  // adicional acá. Fix (drill-down holding-wide): `resolveEmpresaId` agrega
  // la tercera rama (`query.empresaId`) que `leads.access.ts::aplicarFiltroEmpresa`
  // no puede cubrir porque ese helper no conoce el query de métricas — se
  // resuelve inline acá, mismo criterio que `bridge.service.ts::buildBridgeWhere`.
  const where: Prisma.LeadWhereInput = {};
  const empresaId = resolveEmpresaId(usuario, query);
  if (empresaId !== null) where.empresaId = empresaId;

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
  // Bloque C (Fase 2/Stage 2, D6): mismo criterio que `resolveAlcanceBase` —
  // `null` = holding-wide (sin restricción), cualquier otro valor acota la
  // consulta cruda a esa empresa.
  empresaId: string | null;
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
    empresaId: resolveEmpresaId(usuario, query),
    redSocial: query.redSocial ?? null,
    campania: query.campania ?? null,
    campoFecha,
    desde,
    hasta,
  };
}

export function resolveRendimientoCampaniaFiltro(
  usuario: UsuarioAcceso,
  query: MetricasQuery,
  desde: Date,
  hasta: Date,
): RendimientoCampaniaFiltro {
  return {
    responsableIds: resolveResponsableIds(usuario, query),
    empresaId: resolveEmpresaId(usuario, query),
    redSocial: query.redSocial ?? null,
    campania: query.campania ?? null,
    desde,
    hasta,
  };
}

// ---------------------------------------------------------------------------
// Extensiones de dashboard (Bloque E, "Extensiones de dashboard" en
// docs/blocks/e-dashboards.md): mismo alcance rol/empresa que
// `resolveAlcanceBase`, proyectado sobre `Oportunidad` en vez de `Lead` --
// `Oportunidad.asesorId`/`vendedorId`/`empresaId` tienen exactamente el mismo
// shape que en `Lead` (D13, split negociación), así que `resolveResponsableIds`
// y `aplicarFiltroEmpresa` se reutilizan tal cual, sin reimplementar la
// resolución de alcance por rol.
//
// Decisión propia: `query.redSocial`/`query.campania` NO se proyectan acá --
// ambos filtros leen `Lead.redSocial`/`Lead.payloadOriginal` (JSONB de
// ingesta), campos que `Oportunidad` no tiene (D13 los deja en `Lead`). Cruzar
// esos filtros requeriría un join a `Lead` no pedido por este batch; los
// endpoints de Oportunidad ignoran esos dos query params en silencio, mismo
// criterio que `resolveResponsableIds` ignora `responsableId` para
// Asesor/Vendedor (un query param que no aplica al rol/entidad actual se
// descarta, nunca se rechaza con 400).
// ---------------------------------------------------------------------------

export function resolveAlcanceBaseOportunidad(
  usuario: UsuarioAcceso,
  query: MetricasQuery,
): Prisma.OportunidadWhereInput {
  // Fix (drill-down holding-wide): mismo criterio que `resolveAlcanceBase`
  // arriba — `resolveEmpresaId` cubre la tercera rama (`query.empresaId`).
  const where: Prisma.OportunidadWhereInput = {};
  const empresaId = resolveEmpresaId(usuario, query);
  if (empresaId !== null) where.empresaId = empresaId;

  const responsableIds = resolveResponsableIds(usuario, query);
  if (responsableIds) {
    where.OR = responsableIds.flatMap((id) => [{ asesorId: id }, { vendedorId: id }]);
  }

  return where;
}

export type CampoFechaMetricaOportunidad = "creadaEn" | "cerradaEn";

/** Mismo criterio que `aplicarRangoFecha`, proyectado sobre `Oportunidad`. */
export function aplicarRangoFechaOportunidad(
  where: Prisma.OportunidadWhereInput,
  campo: CampoFechaMetricaOportunidad,
  desde: Date,
  hasta: Date,
): Prisma.OportunidadWhereInput {
  return { ...where, [campo]: { gte: desde, lte: hasta } };
}
