import type { Cita, Prisma } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

export interface CreateCitaData {
  leadId: string;
  /**
   * Bloque C (Etapa 3, D4 — RLS): denormalizado desde `Lead.empresaId`,
   * requerido desde esta migración (`citas.empresa_id` NOT NULL).
   */
  empresaId: string;
  usuarioId: string;
  programadaPara: Date;
  /** Vista de calendario (feature aditiva post-M7): ver comentario del campo en `schema.prisma`. */
  finalizaEn: Date;
  modalidad: Cita["modalidad"];
  notas?: Cita["notas"];
}

/**
 * Vista de calendario (feature aditiva post-M7): `citaRepository.createCita`/
 * `updateCita` NUNCA capturan este error acá — la traducción a `AppError`
 * 409 vive en `citas.service.ts` (mismo split responsabilidad/HTTP que
 * `VersionConflictError`/`asignacion.service.ts`), este repositorio solo deja
 * que Postgres rechace la escritura.
 *
 * DEVIATION empírica (documentada porque no era obvia): una violación del
 * `EXCLUDE USING gist` (SQLSTATE `23P01`) via `prisma.cita.create`/`update`
 * NO llega como `Prisma.PrismaClientKnownRequestError` (a diferencia de una
 * violación `UNIQUE`, que sí llega como `P2002`, ver
 * `canal-manual.service.ts`) — llega como `Prisma.PrismaClientUnknownRequestError`,
 * sin `.code`/`.meta` estructurados, con el código SQLSTATE y el nombre del
 * constraint solo disponibles en el texto de `.message` (verificado con un
 * caso reproducido de punta a punta contra Postgres real antes de escribir
 * este código, no una suposición). `citas.service.ts::traducirConflictoDeHorario`
 * detecta esto por texto de mensaje, no por `.code`.
 */
export const SQLSTATE_EXCLUSION_VIOLATION = "23P01";
export const CONSTRAINT_NO_SOLAPAMIENTO = "citas_no_solapamiento_por_asesor";

export async function createCita(
  data: CreateCitaData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Cita> {
  return client.cita.create({ data });
}

export async function findById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Cita | null> {
  return client.cita.findUnique({ where: { id } });
}

/** Más reciente primero — el listado por lead no pagina (volumen bajo por lead, MVP). */
export async function findByLead(
  leadId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Cita[]> {
  return client.cita.findMany({ where: { leadId }, orderBy: { programadaPara: "desc" } });
}

export interface UpdateCitaData {
  estado?: Cita["estado"];
  programadaPara?: Date;
  /** Vista de calendario (feature aditiva post-M7): acompaña a `programadaPara` en `rescheduleCita`. */
  finalizaEn?: Date;
  recordatorioEnviado?: boolean;
}

export async function updateCita(
  id: string,
  data: UpdateCitaData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Cita> {
  return client.cita.update({ where: { id }, data });
}

/**
 * Vista de calendario (feature aditiva post-M7, `GET /citas`):
 * `citas.service.ts::listCitas` arma el `where` completo (alcance de
 * empresa/asesor + rango de fechas) — este repositorio solo agrega el
 * `include` de detalle que el frontend necesita para pintar el calendario
 * sin una segunda vuelta a la API (`lead.cliente` + `usuario`), en una sola
 * consulta (sin N+1). Orden ascendente por `programadaPara` — a diferencia
 * de `findByLead` (más reciente primero, para un historial), acá es un
 * calendario: el evento más próximo primero.
 */
export type CitaConDetalle = Prisma.CitaGetPayload<{
  include: {
    lead: { select: { id: true; cliente: { select: { nombre: true; telefonoNormalizado: true } } } };
    usuario: { select: { id: true; nombre: true } };
  };
}>;

export async function findManyConDetalle(
  where: Prisma.CitaWhereInput,
  client: PrismaClientOrTransaction = prisma,
): Promise<CitaConDetalle[]> {
  return client.cita.findMany({
    where,
    include: {
      lead: { select: { id: true, cliente: { select: { nombre: true, telefonoNormalizado: true } } } },
      usuario: { select: { id: true, nombre: true } },
    },
    orderBy: { programadaPara: "asc" },
  });
}

/**
 * M7 (diseño, trabajo de recordatorio): candidatos exactos para el tick —
 * `estado = AGENDADA`, sin recordatorio previo, `programadaPara` dentro de
 * `[desde, hasta]`. Misma forma que `idx_leads_sla`/`(estado,
 * programadaPara)` de este modelo (ver `schema.prisma`). Genérica a
 * propósito: el llamador decide la ventana — `citas-recordatorio.service.ts`
 * la usa hoy con "mañana en Ecuador" (`lib/rango-fechas.ts::rangoManianaEcuador`),
 * antes era "próxima 1h" (M7 original) — este repositorio no conoce esa regla.
 */
export async function findPendientesDeRecordatorio(
  desde: Date,
  hasta: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<Cita[]> {
  return client.cita.findMany({
    where: {
      estado: "AGENDADA",
      recordatorioEnviado: false,
      programadaPara: { gte: desde, lte: hasta },
    },
  });
}

/**
 * D-recordatorio (diseño M7): guarda anti-duplicado atómica a nivel de fila
 * — el `WHERE recordatorioEnviado: false` en el propio `updateMany` es la
 * condición que evita que dos ticks concurrentes marquen la misma cita dos
 * veces (mismo espíritu que el filtro de idempotencia de
 * `sla-atrasado.service.ts`, adaptado a una bandera booleana en vez de un
 * evento append-only, porque `citas.recordatorio_enviado` sí es una bandera
 * de estado, no un log).
 */
export async function marcarRecordatorioEnviado(
  ids: readonly string[],
  client: PrismaClientOrTransaction = prisma,
): Promise<Prisma.BatchPayload> {
  if (ids.length === 0) return { count: 0 };
  return client.cita.updateMany({
    where: { id: { in: [...ids] }, recordatorioEnviado: false },
    data: { recordatorioEnviado: true },
  });
}
