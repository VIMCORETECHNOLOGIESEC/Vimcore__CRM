import type { EstadoReporteJob, Prisma, ReporteJob } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

const ESTADOS_ACTIVOS: readonly EstadoReporteJob[] = ["PENDIENTE", "PROCESANDO"];

export interface CreateReporteJobData {
  usuarioId: string;
  tipo: string;
  parametros: Prisma.InputJsonValue;
}

export async function create(
  data: CreateReporteJobData,
  client: PrismaClientOrTransaction = prisma,
): Promise<ReporteJob> {
  return client.reporteJob.create({ data });
}

/**
 * Bloqueo de generación duplicada (docs/blocks/e-dashboards.md): mismo
 * `usuarioId` + mismo `tipo` + mismos `parametros` (igualdad JSON exacta vía
 * `equals`, JSONB no distingue orden de claves) ya `PENDIENTE`/`PROCESANDO`
 * -- se devuelve ese job en vez de crear uno nuevo.
 */
export async function findActivoDuplicado(
  usuarioId: string,
  tipo: string,
  parametros: Prisma.InputJsonValue,
  client: PrismaClientOrTransaction = prisma,
): Promise<ReporteJob | null> {
  return client.reporteJob.findFirst({
    where: { usuarioId, tipo, estado: { in: [...ESTADOS_ACTIVOS] }, parametros: { equals: parametros } },
    orderBy: { creadoEn: "desc" },
  });
}

/**
 * `GET /reportes/jobs/activo` (endpoint de resincronización, docs/blocks/
 * e-dashboards.md): scope por `usuarioId` únicamente -- `ReporteJob` no tiene
 * `empresaId` propio (ver comentario del modelo en schema.prisma), así que
 * este filtro YA satisface el requisito de "nunca depender de `parametros`
 * confiado del cliente": el JWT resuelve `usuarioId`, no el request.
 */
export async function findActivoPorUsuario(
  usuarioId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<ReporteJob | null> {
  return client.reporteJob.findFirst({
    where: { usuarioId, estado: { in: [...ESTADOS_ACTIVOS] } },
    orderBy: { creadoEn: "desc" },
  });
}

export async function findById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<ReporteJob | null> {
  return client.reporteJob.findUnique({ where: { id } });
}

export async function marcarProcesando(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<ReporteJob> {
  return client.reporteJob.update({ where: { id }, data: { estado: "PROCESANDO" } });
}

export async function marcarListo(
  id: string,
  archivoUrl: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<ReporteJob> {
  return client.reporteJob.update({
    where: { id },
    data: { estado: "LISTO", archivoUrl, finalizadoEn: new Date() },
  });
}

export async function marcarError(
  id: string,
  error: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<ReporteJob> {
  return client.reporteJob.update({
    where: { id },
    data: { estado: "ERROR", error, finalizadoEn: new Date() },
  });
}
