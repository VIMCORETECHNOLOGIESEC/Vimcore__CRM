import { Prisma, type RedSocial } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

export interface UpsertCampaniaAdsData {
  cuentaAnunciosConexionId: string;
  idExterno: string;
  nombre: string;
  redSocial: RedSocial;
  activa: boolean;
}

export async function upsertCampaniaAds(
  data: UpsertCampaniaAdsData,
  client: PrismaClientOrTransaction = prisma,
): Promise<{ id: string }> {
  const existente = await client.campania.findFirst({
    where: {
      cuentaAnunciosConexionId: data.cuentaAnunciosConexionId,
      idExterno: data.idExterno,
    },
    select: { id: true },
  });

  if (existente) {
    return client.campania.update({
      where: { id: existente.id },
      data: {
        nombre: data.nombre,
        redSocial: data.redSocial,
        activa: data.activa,
      },
      select: { id: true },
    });
  }

  return client.campania.create({
    data: {
      cuentaAnunciosConexionId: data.cuentaAnunciosConexionId,
      idExterno: data.idExterno,
      nombre: data.nombre,
      redSocial: data.redSocial,
      activa: data.activa,
    },
    select: { id: true },
  });
}

export interface UpsertMetricaDiariaData {
  campaniaId: string;
  fecha: Date;
  redSocial: RedSocial;
  gasto: string;
  impresiones: number;
  clics: number;
  alcance: number;
  moneda: string;
}

export async function upsertMetricaDiaria(
  data: UpsertMetricaDiariaData,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.campaniaMetricaDiaria.upsert({
    where: {
      campaniaId_fecha_redSocial: {
        campaniaId: data.campaniaId,
        fecha: data.fecha,
        redSocial: data.redSocial,
      },
    },
    create: data,
    update: {
      gasto: data.gasto,
      impresiones: data.impresiones,
      clics: data.clics,
      alcance: data.alcance,
      moneda: data.moneda,
    },
  });
}

export interface RendimientoCampaniaRow {
  campaniaId: string;
  idExterno: string;
  nombreCampania: string;
  redSocial: RedSocial;
  moneda: string;
  gasto: number;
  impresiones: number;
  clics: number;
  alcance: number;
  leads: number;
  ventas: number;
}

export interface RendimientoCampaniaFiltro {
  empresaId: string | null;
  responsableIds: string[] | null;
  redSocial: string | null;
  campania: string | null;
  desde: Date;
  hasta: Date;
}

function buildMetricaWhere(filtro: RendimientoCampaniaFiltro): Prisma.Sql {
  const partes: Prisma.Sql[] = [
    Prisma.sql`m.fecha BETWEEN ${filtro.desde}::date AND ${filtro.hasta}::date`,
  ];
  if (filtro.empresaId !== null) {
    partes.push(Prisma.sql`cac.empresa_id = ${filtro.empresaId}::uuid`);
  }
  if (filtro.redSocial) {
    partes.push(Prisma.sql`m.red_social = ${filtro.redSocial}::red_social`);
  }
  if (filtro.campania) {
    partes.push(Prisma.sql`c.nombre ILIKE ${"%" + filtro.campania + "%"}`);
  }
  return Prisma.join(partes, " AND ");
}

function buildResponsableWhere(filtro: RendimientoCampaniaFiltro, alias: string): Prisma.Sql {
  if (!filtro.responsableIds || filtro.responsableIds.length === 0) return Prisma.empty;
  return Prisma.sql`AND (${Prisma.raw(alias)}.asesor_id = ANY(${filtro.responsableIds}::uuid[]) OR ${Prisma.raw(alias)}.vendedor_id = ANY(${filtro.responsableIds}::uuid[]))`;
}

export async function getRendimientoCampanias(
  filtro: RendimientoCampaniaFiltro,
  client: PrismaClientOrTransaction = prisma,
): Promise<RendimientoCampaniaRow[]> {
  const whereMetricas = buildMetricaWhere(filtro);
  const responsableLead = buildResponsableWhere(filtro, "l");
  const responsableOportunidad = buildResponsableWhere(filtro, "o");

  const filas = await client.$queryRaw<
    Array<{
      campaniaId: string;
      idExterno: string;
      nombreCampania: string;
      redSocial: RedSocial;
      moneda: string;
      gasto: string;
      impresiones: bigint;
      clics: bigint;
      alcance: bigint;
      leads: bigint;
      ventas: bigint;
    }>
  >`
    WITH metricas AS (
      SELECT
        c.id,
        c.id_externo,
        c.nombre,
        m.red_social,
        m.moneda,
        SUM(m.gasto)::text AS gasto,
        SUM(m.impresiones)::bigint AS impresiones,
        SUM(m.clics)::bigint AS clics,
        SUM(m.alcance)::bigint AS alcance
      FROM campania_metricas_diarias m
      JOIN campanias c ON c.id = m.campania_id
      JOIN cuentas_anuncios_conexiones cac ON cac.id = c.cuenta_anuncios_conexion_id
      WHERE ${whereMetricas}
      GROUP BY c.id, c.id_externo, c.nombre, m.red_social, m.moneda
    )
    SELECT
      metricas.id::text AS "campaniaId",
      metricas.id_externo AS "idExterno",
      metricas.nombre AS "nombreCampania",
      metricas.red_social AS "redSocial",
      metricas.moneda,
      metricas.gasto,
      metricas.impresiones,
      metricas.clics,
      metricas.alcance,
      COALESCE(leads.total, 0)::bigint AS leads,
      COALESCE(ventas.total, 0)::bigint AS ventas
    FROM metricas
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::bigint AS total
      FROM leads l
      WHERE l.campania_id = metricas.id
        AND l.red_social = metricas.red_social
        AND l.ingresado_en BETWEEN ${filtro.desde} AND ${filtro.hasta}
        ${responsableLead}
    ) leads ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::bigint AS total
      FROM oportunidades o
      JOIN leads l2 ON l2.id = o.lead_id
      WHERE l2.campania_id = metricas.id
        AND l2.red_social = metricas.red_social
        AND o.etapa = 'VENTA'
        AND o.cerrada_en BETWEEN ${filtro.desde} AND ${filtro.hasta}
        ${responsableOportunidad}
    ) ventas ON true
    ORDER BY metricas.gasto::numeric DESC, metricas.nombre ASC
  `;

  return filas.map((fila) => ({
    campaniaId: fila.campaniaId,
    idExterno: fila.idExterno,
    nombreCampania: fila.nombreCampania,
    redSocial: fila.redSocial,
    moneda: fila.moneda,
    gasto: Number(fila.gasto),
    impresiones: Number(fila.impresiones),
    clics: Number(fila.clics),
    alcance: Number(fila.alcance),
    leads: Number(fila.leads),
    ventas: Number(fila.ventas),
  }));
}
