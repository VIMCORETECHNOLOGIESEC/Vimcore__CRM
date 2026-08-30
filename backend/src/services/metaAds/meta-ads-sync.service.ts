import type { RedSocial } from "@prisma/client";
import { decrypt } from "../../lib/cifrado-token.js";
import { logger } from "../../lib/logger.js";
import { prisma, runAsBypassJob, runWithTenantContext } from "../../lib/prisma.js";
import * as metricasRepository from "../../repositories/metaAds/campania-metrica-diaria.repository.js";
import * as conexionRepository from "../../repositories/metaAds/cuenta-anuncios-conexion.repository.js";
import { MetaAdsApiError, createMetaMarketingApiClient } from "./meta-marketing-api.service.js";

export const META_ADS_INITIAL_SYNC_DAYS = 30;
export const META_ADS_OVERLAP_SYNC_DAYS = 3;
const META_ADS_SYNC_BOUNDS = { maxWait: 10_000, timeout: 20_000 };

function utcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysAgo(base: Date, days: number): Date {
  const result = utcDateOnly(base);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function resolveVentana(ultimaSincronizacionEn: Date | null, ahora: Date): { desde: Date; hasta: Date } {
  return {
    desde: daysAgo(ahora, ultimaSincronizacionEn ? META_ADS_OVERLAP_SYNC_DAYS : META_ADS_INITIAL_SYNC_DAYS),
    hasta: utcDateOnly(ahora),
  };
}

function isCampaniaActiva(estado: string | null): boolean {
  return estado === null || !["DELETED", "ARCHIVED"].includes(estado.toUpperCase());
}

function mensajeSeguro(error: unknown): string {
  if (error instanceof MetaAdsApiError) {
    if (error.kind === "token_expired") return "Meta rechazó el token de la cuenta de anuncios";
    if (error.kind === "transient") return "Meta Ads respondió con un error transitorio";
    return "Meta Ads respondió con un error permanente";
  }
  return "No se pudo sincronizar Meta Ads";
}

export async function syncMetaAdsConexion(conexionId: string, ahora: Date = new Date()): Promise<void> {
  const conexion = await conexionRepository.findWithTokenById(conexionId);
  if (!conexion || !conexion.tokenCifrado || conexion.estado !== "ACTIVA") return;

  const { desde, hasta } = resolveVentana(conexion.ultimaSincronizacionEn, ahora);

  try {
    const accessToken = decrypt(conexion.tokenCifrado);
    const client = createMetaMarketingApiClient(accessToken);
    const [campanias, insights] = await Promise.all([
      client.listCampaigns(conexion.cuentaAnunciosIdExterno),
      client.listDailyInsights(conexion.cuentaAnunciosIdExterno, desde, hasta),
    ]);

    const campaniasPorId = new Map<string, { id: string }>();
    await prisma.$transaction(async (tx) => {
      for (const campania of campanias) {
        const local = await metricasRepository.upsertCampaniaAds({
          cuentaAnunciosConexionId: conexion.id,
          idExterno: campania.idExterno,
          nombre: campania.nombre,
          redSocial: "FACEBOOK",
          activa: isCampaniaActiva(campania.estado),
        }, tx);
        campaniasPorId.set(campania.idExterno, local);
      }

      const moneda = conexion.moneda ?? "USD";
      for (const insight of insights) {
        const campania = campaniasPorId.get(insight.campaniaIdExterno);
        if (!campania) continue;
        await metricasRepository.upsertMetricaDiaria({
          campaniaId: campania.id,
          fecha: new Date(`${insight.fecha}T00:00:00.000Z`),
          redSocial: insight.redSocial as RedSocial,
          gasto: insight.gasto,
          impresiones: insight.impresiones,
          clics: insight.clics,
          alcance: insight.alcance,
          moneda,
        }, tx);
      }

      await conexionRepository.markSyncSuccess(conexion.id, ahora, tx);
    }, META_ADS_SYNC_BOUNDS);
  } catch (error) {
    const mensaje = mensajeSeguro(error);
    logger.error({ err: error, conexionId: conexion.id, empresaId: conexion.empresaId }, "meta-ads: fallo de sincronización");
    if (error instanceof MetaAdsApiError && error.kind === "token_expired") {
      await conexionRepository.markTokenExpired(conexion.id);
      return;
    }
    if (error instanceof MetaAdsApiError && error.kind === "transient") {
      await conexionRepository.markTransientSyncError(conexion.id, mensaje);
      return;
    }
    await conexionRepository.markSyncError(conexion.id, mensaje);
  }
}

export async function runMetaAdsSyncOnce(ahora: Date = new Date()): Promise<void> {
  const conexiones = await runAsBypassJob(
    "meta-ads-sync",
    (tx) => conexionRepository.listEligibleForSync(tx),
    META_ADS_SYNC_BOUNDS,
  );

  for (const conexion of conexiones) {
    await runWithTenantContext({ empresaId: conexion.empresaId }, () => syncMetaAdsConexion(conexion.id, ahora));
  }
}
