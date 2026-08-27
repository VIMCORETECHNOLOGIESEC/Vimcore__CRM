import type { EtapaLead, Semaforo } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";
import type { FiltroLeadsSql } from "../services/metricas.access.js";

/**
 * M9 (`docs/06-modulos-backend.md`, "Servicio de agregación de KPIs"):
 * `metricas.service.ts` construye el `where`/`FiltroLeadsSql` (alcance +
 * rango de fechas ya resuelto) y este repositorio solo ejecuta — mismo
 * reparto de responsabilidades que `lead.repository.ts` (nunca decide
 * alcance ni fechas).
 */

/** Conteo simple bajo un `where` ya resuelto por el servicio. */
export async function count(where: Prisma.LeadWhereInput, client: PrismaClientOrTransaction = prisma): Promise<number> {
  return client.lead.count({ where });
}

export interface ConteoPorEtapa {
  etapa: EtapaLead;
  total: number;
}

/** 3.3/embudo, `/por-etapa`: conteo agrupado por etapa bajo el `where` dado. */
export async function countPorEtapa(
  where: Prisma.LeadWhereInput,
  client: PrismaClientOrTransaction = prisma,
): Promise<ConteoPorEtapa[]> {
  const filas = await client.lead.groupBy({ by: ["etapa"], where, _count: { _all: true } });
  return filas.map((f) => ({ etapa: f.etapa, total: f._count._all }));
}

export interface ConteoPorRedSocial {
  redSocial: string;
  total: number;
}

/** 3.1 (leads por red social): excluye `redSocial IS NULL` (leads pre-M5 sin dato). */
export async function countPorRedSocial(
  where: Prisma.LeadWhereInput,
  client: PrismaClientOrTransaction = prisma,
): Promise<ConteoPorRedSocial[]> {
  const filas = await client.lead.groupBy({
    by: ["redSocial"],
    where: { ...where, redSocial: { not: null } },
    _count: { _all: true },
  });
  return filas.map((f) => ({ redSocial: f.redSocial as string, total: f._count._all }));
}

export interface ConteoPorRedYEtapa {
  redSocial: string;
  etapa: EtapaLead;
  total: number;
}

/** Sub-conteo VENTA/NO_VENTA por red social — tasa de conversión de 3.1. */
export async function countPorRedSocialYEtapaCierre(
  where: Prisma.LeadWhereInput,
  client: PrismaClientOrTransaction = prisma,
): Promise<ConteoPorRedYEtapa[]> {
  const filas = await client.lead.groupBy({
    by: ["redSocial", "etapa"],
    where: { ...where, redSocial: { not: null }, etapa: { in: ["VENTA", "NO_VENTA"] } },
    _count: { _all: true },
  });
  return filas.map((f) => ({ redSocial: f.redSocial as string, etapa: f.etapa, total: f._count._all }));
}

export interface ConteoPorRedYSemaforo {
  redSocial: string;
  semaforo: Semaforo | null;
  total: number;
}

/** 3.5 (red social × semáforo): matriz cruzada, `semaforo=null` = sin calificar (D14). */
export async function countPorRedSocialYSemaforo(
  where: Prisma.LeadWhereInput,
  client: PrismaClientOrTransaction = prisma,
): Promise<ConteoPorRedYSemaforo[]> {
  const filas = await client.lead.groupBy({
    by: ["redSocial", "semaforo"],
    where: { ...where, redSocial: { not: null } },
    _count: { _all: true },
  });
  return filas.map((f) => ({ redSocial: f.redSocial as string, semaforo: f.semaforo, total: f._count._all }));
}

export interface ConteoPorSemaforo {
  semaforo: Semaforo | null;
  total: number;
}

/** 3.6 (distribución por semáforo): el `where` ya debe excluir cerrados (servicio). */
export async function countPorSemaforo(
  where: Prisma.LeadWhereInput,
  client: PrismaClientOrTransaction = prisma,
): Promise<ConteoPorSemaforo[]> {
  const filas = await client.lead.groupBy({ by: ["semaforo"], where, _count: { _all: true } });
  return filas.map((f) => ({ semaforo: f.semaforo, total: f._count._all }));
}

/**
 * Fragmento `WHERE` compartido por las consultas SQL crudas de este archivo
 * — proyección de `FiltroLeadsSql` (`metricas.access.ts`) a `Prisma.Sql`.
 * `alias` es siempre un literal fijo del código (`"l"`), nunca entrada de
 * usuario — seguro para interpolar sin parametrizar.
 */
function buildWhereFragment(filtro: FiltroLeadsSql, alias: string): Prisma.Sql {
  const partes: Prisma.Sql[] = [];

  // Bloque C (Fase 2/Stage 2, D6): mismo criterio que `resolveAlcanceBase` —
  // `null` = holding-wide, sin restricción adicional.
  if (filtro.empresaId !== null) {
    partes.push(Prisma.sql`${Prisma.raw(alias)}.empresa_id = ${filtro.empresaId}::uuid`);
  }

  if (filtro.responsableIds && filtro.responsableIds.length > 0) {
    partes.push(
      Prisma.sql`(${Prisma.raw(alias)}.asesor_id = ANY(${filtro.responsableIds}::uuid[]) OR ${Prisma.raw(alias)}.vendedor_id = ANY(${filtro.responsableIds}::uuid[]))`,
    );
  }
  if (filtro.redSocial) {
    partes.push(Prisma.sql`${Prisma.raw(alias)}.red_social = ${filtro.redSocial}::red_social`);
  }
  if (filtro.campania) {
    partes.push(Prisma.sql`${Prisma.raw(alias)}.payload_original ->> 'nombreCampania' ILIKE ${"%" + filtro.campania + "%"}`);
  }
  partes.push(
    Prisma.sql`${Prisma.raw(alias)}.${Prisma.raw(filtro.campoFecha)} BETWEEN ${filtro.desde} AND ${filtro.hasta}`,
  );

  return Prisma.join(partes, " AND ");
}

export interface CierrePromedioRow {
  totalVentas: number;
  promedioSegundos: number | null;
}

/**
 * 2.6 (tiempo promedio de cierre): `AVG(cerrado_en - ingresado_en)` solo
 * sobre `etapa = VENTA` — `filtro.campoFecha` debe ser `cerrado_en` (docs/08
 * §2.6, "desde ingresado_en hasta cerrado_en... criterio de fecha: por fecha
 * de cierre").
 */
export async function getCierrePromedio(
  filtro: FiltroLeadsSql,
  client: PrismaClientOrTransaction = prisma,
): Promise<CierrePromedioRow> {
  const whereFragment = buildWhereFragment(filtro, "l");
  const [row] = await client.$queryRaw<Array<{ totalVentas: bigint; promedioSegundos: number | null }>>(Prisma.sql`
    SELECT
      COUNT(*)::bigint AS "totalVentas",
      AVG(EXTRACT(EPOCH FROM (l.cerrado_en - l.ingresado_en))) AS "promedioSegundos"
    FROM leads l
    WHERE l.etapa = 'VENTA' AND ${whereFragment}
  `);
  return { totalVentas: Number(row?.totalVentas ?? 0n), promedioSegundos: row?.promedioSegundos ?? null };
}

export interface RespuestaSlaRow {
  totalAsignados: number;
  sinPrimeraRespuesta: number;
  promedioSegundosRespuesta: number | null;
  atendidosDentro24h: number;
}

/**
 * 2.5 (tiempo promedio de primera respuesta) + 2.7 (cumplimiento de SLA):
 * ambos se resuelven con la MISMA correlación por lead — "primer
 * CAMBIO_ETAPA que saca al lead de NUEVO después de su ASIGNACION" — así que
 * comparten una única consulta (evita duplicar el `JOIN`/`DISTINCT ON`
 * correlacionado). `filtro.campoFecha` debe ser `ingresado_en` — decisión
 * propia (docs/08 no lo especifica para 2.5/2.7): se scopea por el ingreso
 * del lead al rango pedido, igual que 2.1/2.2, en vez de por el instante del
 * evento ASIGNACION — mantiene un único criterio de fecha por defecto para
 * todos los indicadores que no son explícitamente "por cierre" (docs/08
 * §2.3 solo distingue 2.1 vs 2.3 de forma literal).
 *
 * `asignacion.ocurrido_en` = la PRIMERA asignación del lead (`MIN`) — lectura
 * literal de "desde el evento ASIGNACION", singular, del texto de 2.5.
 */
export async function getRespuestaYSla(
  filtro: FiltroLeadsSql,
  client: PrismaClientOrTransaction = prisma,
): Promise<RespuestaSlaRow> {
  const whereFragment = buildWhereFragment(filtro, "l");
  const [row] = await client.$queryRaw<
    Array<{
      totalAsignados: bigint;
      sinPrimeraRespuesta: bigint;
      promedioSegundosRespuesta: number | null;
      atendidosDentro24h: bigint;
    }>
  >(Prisma.sql`
    WITH asignaciones AS (
      SELECT lead_id, MIN(ocurrido_en) AS asignado_en
      FROM lead_eventos
      WHERE tipo = 'ASIGNACION'
      GROUP BY lead_id
    ),
    primeras_salidas AS (
      SELECT DISTINCT ON (le.lead_id) le.lead_id, le.ocurrido_en AS salida_en
      FROM lead_eventos le
      JOIN asignaciones a ON a.lead_id = le.lead_id
      WHERE le.tipo = 'CAMBIO_ETAPA' AND le.etapa_anterior = 'NUEVO' AND le.ocurrido_en >= a.asignado_en
      ORDER BY le.lead_id, le.ocurrido_en ASC
    )
    SELECT
      COUNT(*)::bigint AS "totalAsignados",
      COUNT(*) FILTER (WHERE ps.salida_en IS NULL)::bigint AS "sinPrimeraRespuesta",
      AVG(EXTRACT(EPOCH FROM (ps.salida_en - a.asignado_en))) FILTER (WHERE ps.salida_en IS NOT NULL) AS "promedioSegundosRespuesta",
      COUNT(*) FILTER (
        WHERE ps.salida_en IS NOT NULL AND ps.salida_en <= a.asignado_en + interval '24 hours'
      )::bigint AS "atendidosDentro24h"
    FROM asignaciones a
    JOIN leads l ON l.id = a.lead_id
    LEFT JOIN primeras_salidas ps ON ps.lead_id = a.lead_id
    WHERE ${whereFragment}
  `);
  return {
    totalAsignados: Number(row?.totalAsignados ?? 0n),
    sinPrimeraRespuesta: Number(row?.sinPrimeraRespuesta ?? 0n),
    promedioSegundosRespuesta: row?.promedioSegundosRespuesta ?? null,
    atendidosDentro24h: Number(row?.atendidosDentro24h ?? 0n),
  };
}

export interface PorAsesorRow {
  responsableId: string;
  total: number;
  ventas: number;
  noVentas: number;
  asignados: number;
  atendidosDentro24h: number;
}

/**
 * 3.2 (leads por asesor, "visible solo para admin/supervisor" — verificado
 * en `metricas.service.ts`, no acá): agrupa por el responsable OPERATIVO
 * actual — `COALESCE(vendedor_id, asesor_id)`, mismo criterio que
 * `leads.access.ts::canEdit` — porque Prisma `groupBy` no expresa un
 * `COALESCE` como clave de agrupación. Reutiliza la misma correlación
 * ASIGNACION/primer-CAMBIO_ETAPA que `getRespuestaYSla` para el cumplimiento
 * de SLA por asesor (docs/08 §3.2, "métricas secundarias... cumplimiento de
 * SLA").
 *
 * Decisión propia: venta/noVentas se cuentan DENTRO del mismo `where`
 * (scopeado por `ingresado_en`, igual que `total`) — no se re-filtran por
 * `cerrado_en` — para no mezclar dos criterios de fecha distintos en una
 * única fila agrupada. Ver nota equivalente en `metricas.service.ts`.
 */
export async function getPorAsesorConSla(
  filtro: FiltroLeadsSql,
  client: PrismaClientOrTransaction = prisma,
): Promise<PorAsesorRow[]> {
  const whereFragment = buildWhereFragment(filtro, "l");
  const filas = await client.$queryRaw<
    Array<{
      responsableId: string;
      total: bigint;
      ventas: bigint;
      noVentas: bigint;
      asignados: bigint;
      atendidosDentro24h: bigint;
    }>
  >(Prisma.sql`
    WITH asignaciones AS (
      SELECT lead_id, MIN(ocurrido_en) AS asignado_en
      FROM lead_eventos
      WHERE tipo = 'ASIGNACION'
      GROUP BY lead_id
    ),
    primeras_salidas AS (
      SELECT DISTINCT ON (le.lead_id) le.lead_id, le.ocurrido_en AS salida_en
      FROM lead_eventos le
      JOIN asignaciones a ON a.lead_id = le.lead_id
      WHERE le.tipo = 'CAMBIO_ETAPA' AND le.etapa_anterior = 'NUEVO' AND le.ocurrido_en >= a.asignado_en
      ORDER BY le.lead_id, le.ocurrido_en ASC
    )
    SELECT
      COALESCE(l.vendedor_id, l.asesor_id)::text AS "responsableId",
      COUNT(*)::bigint AS "total",
      COUNT(*) FILTER (WHERE l.etapa = 'VENTA')::bigint AS "ventas",
      COUNT(*) FILTER (WHERE l.etapa = 'NO_VENTA')::bigint AS "noVentas",
      COUNT(a.lead_id)::bigint AS "asignados",
      COUNT(*) FILTER (
        WHERE ps.salida_en IS NOT NULL AND ps.salida_en <= a.asignado_en + interval '24 hours'
      )::bigint AS "atendidosDentro24h"
    FROM leads l
    LEFT JOIN asignaciones a ON a.lead_id = l.id
    LEFT JOIN primeras_salidas ps ON ps.lead_id = l.id
    WHERE COALESCE(l.vendedor_id, l.asesor_id) IS NOT NULL AND ${whereFragment}
    GROUP BY COALESCE(l.vendedor_id, l.asesor_id)
    ORDER BY "total" DESC
  `);
  return filas.map((f) => ({
    responsableId: f.responsableId,
    total: Number(f.total),
    ventas: Number(f.ventas),
    noVentas: Number(f.noVentas),
    asignados: Number(f.asignados),
    atendidosDentro24h: Number(f.atendidosDentro24h),
  }));
}

export interface PorCampaniaRow {
  nombreCampania: string;
  redSocial: string | null;
  total: number;
}

/**
 * 3.4 (leads por campaña, top 10): `GROUP BY payload_original->>'nombreCampania',
 * red_social` — dos registros de campaña homónima en redes distintas son
 * independientes (docs/08 §3.4), Prisma `groupBy` no expresa extracción de
 * JSON path como clave.
 */
export async function getPorCampaniaTop10(
  filtro: FiltroLeadsSql,
  client: PrismaClientOrTransaction = prisma,
): Promise<PorCampaniaRow[]> {
  const whereFragment = buildWhereFragment(filtro, "l");
  const filas = await client.$queryRaw<Array<{ nombreCampania: string; redSocial: string | null; total: bigint }>>(
    Prisma.sql`
      SELECT
        l.payload_original ->> 'nombreCampania' AS "nombreCampania",
        l.red_social::text AS "redSocial",
        COUNT(*)::bigint AS "total"
      FROM leads l
      WHERE l.payload_original ->> 'nombreCampania' IS NOT NULL AND ${whereFragment}
      GROUP BY l.payload_original ->> 'nombreCampania', l.red_social
      ORDER BY "total" DESC
      LIMIT 10
    `,
  );
  return filas.map((f) => ({ nombreCampania: f.nombreCampania, redSocial: f.redSocial, total: Number(f.total) }));
}
