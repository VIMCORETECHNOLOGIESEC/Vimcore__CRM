import type { Oportunidad, Prisma } from "@prisma/client";
import { EtapaLead } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

/**
 * negociacion (Bloque D, D-CAS): mirror deliberado de
 * `lead.repository.ts::VersionConflictError` -- una clase NUEVA y propia de
 * `Oportunidad`, no una reexportación de la de `Lead` (ese archivo está
 * congelado en este batch, ver cabecera del módulo).
 */
export class OportunidadVersionConflictError extends Error {
  constructor(public readonly oportunidadId: string) {
    super(`Version conflict al asignar la oportunidad ${oportunidadId} -- otro escritor ganó la carrera CAS`);
    this.name = "OportunidadVersionConflictError";
  }
}

/**
 * §D13 (schema): mismos dos valores terminales que `Lead` (`Oportunidad`
 * reusa el enum `EtapaLead` tal cual, D13) -- declarada localmente en vez de
 * importar `lead.repository.ts::ETAPAS_CERRADAS` para que este módulo no
 * dependa de un archivo congelado en este batch.
 */
export const ETAPAS_CERRADAS_OPORTUNIDAD = [EtapaLead.VENTA, EtapaLead.NO_VENTA] as const;

const responsableSelect = {
  id: true,
  nombre: true,
  rol: true,
} as const satisfies Prisma.UsuarioSelect;

const OPORTUNIDAD_RELACIONES_INCLUDE = {
  lead: { include: { cliente: true } },
  producto: true,
  asesor: { select: responsableSelect },
  vendedor: { select: responsableSelect },
} as const satisfies Prisma.OportunidadInclude;

export type OportunidadConRelaciones = Prisma.OportunidadGetPayload<{
  include: typeof OPORTUNIDAD_RELACIONES_INCLUDE;
}>;

export interface CreateOportunidadData {
  leadId: string;
  empresaId: string;
  productoId: string | null;
}

export async function createOportunidad(
  data: CreateOportunidadData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Oportunidad> {
  return client.oportunidad.create({ data });
}

/**
 * D14: dedup -- bloquea crear una `Oportunidad` nueva para `(leadId,
 * productoId)` si ya existe una ABIERTA (etapa fuera de VENTA/NO_VENTA) para
 * esa misma combinación. Sin ventana de espera (a diferencia del reingreso de
 * Cliente/Lead a 90 días): si la anterior ya cerró, se puede abrir una nueva
 * de inmediato -- por eso esta consulta filtra por etapa abierta, nunca por
 * fecha.
 */
export async function findAbiertaPorLeadYProducto(
  leadId: string,
  productoId: string | null,
  client: PrismaClientOrTransaction = prisma,
): Promise<Oportunidad | null> {
  return client.oportunidad.findFirst({
    where: { leadId, productoId, etapa: { notIn: [...ETAPAS_CERRADAS_OPORTUNIDAD] } },
  });
}

export async function findById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<OportunidadConRelaciones | null> {
  return client.oportunidad.findUnique({ where: { id }, include: OPORTUNIDAD_RELACIONES_INCLUDE });
}

/** Lectura plana (sin relaciones) para los pasos internos de servicio (autorización/CAS). */
export async function findRawById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Oportunidad | null> {
  return client.oportunidad.findUnique({ where: { id } });
}

export interface FindManyOportunidadesOptions {
  skip: number;
  take: number;
  orderBy: Prisma.OportunidadOrderByWithRelationInput;
}

export interface FindManyOportunidadesResult {
  oportunidades: OportunidadConRelaciones[];
  total: number;
}

export async function findMany(
  where: Prisma.OportunidadWhereInput,
  options: FindManyOportunidadesOptions,
  client: PrismaClientOrTransaction = prisma,
): Promise<FindManyOportunidadesResult> {
  const [oportunidades, total] = await Promise.all([
    client.oportunidad.findMany({
      where,
      skip: options.skip,
      take: options.take,
      orderBy: options.orderBy,
      include: OPORTUNIDAD_RELACIONES_INCLUDE,
    }),
    client.oportunidad.count({ where }),
  ]);
  return { oportunidades, total };
}

/**
 * D3/D4: mismo criterio DD8 que `lead.repository.ts::countCargaActivaPorResponsable`
 * -- `groupBy` solo devuelve grupos CON filas; el llamador
 * (`asignacion-oportunidad.service.ts::selectAsesor`) completa los candidatos
 * ausentes con carga 0. El cast a `Prisma.TransactionClient["oportunidad"]`
 * replica el mismo workaround de tipos que ese archivo (`groupBy` exige
 * literales estáticos en `by`, que no resuelven bien contra el tipo unión
 * `PrismaClientOrTransaction`).
 */
export async function countCargaActivaPorAsesor(
  empresaId: string,
  candidatoIds: readonly string[],
  client: PrismaClientOrTransaction = prisma,
): Promise<Map<string, number>> {
  if (candidatoIds.length === 0) return new Map();
  const oportunidad = client.oportunidad as Prisma.TransactionClient["oportunidad"];

  const filas = await oportunidad.groupBy({
    by: ["asesorId"],
    where: {
      empresaId,
      asesorId: { in: [...candidatoIds] },
      etapa: { notIn: [...ETAPAS_CERRADAS_OPORTUNIDAD] },
    },
    _count: { _all: true },
  });

  const mapa = new Map<string, number>();
  for (const fila of filas) {
    if (fila.asesorId !== null) mapa.set(fila.asesorId, fila._count._all);
  }
  return mapa;
}

export interface AssignAsesorData {
  asesorId: string;
}

/**
 * D-CAS: mismo mecanismo que `lead.repository.ts::assignResponsable` --
 * `updateMany` gateado por `version = expectedVersion`; `count === 0` señala
 * que otro escritor ganó la carrera y lanza `OportunidadVersionConflictError`.
 * El llamador (`asignacion-oportunidad.service.ts::withCasRetryOportunidad`)
 * decide si reintenta.
 */
export async function assignAsesor(
  id: string,
  data: AssignAsesorData,
  expectedVersion: number,
  client: PrismaClientOrTransaction = prisma,
): Promise<Oportunidad> {
  const resultado = await client.oportunidad.updateMany({
    where: { id, version: expectedVersion },
    data: { asesorId: data.asesorId, version: { increment: 1 } },
  });
  if (resultado.count === 0) {
    throw new OportunidadVersionConflictError(id);
  }
  return client.oportunidad.findUniqueOrThrow({ where: { id } });
}

export interface UpdateEtapaData {
  etapa: Oportunidad["etapa"];
  /** Solo presentes en una transición hacia VENTA/NO_VENTA (D13, POST /cerrar). */
  cerradaEn?: Date;
  montoVenta?: Prisma.Decimal.Value;
  formaPago?: Oportunidad["formaPago"];
  observacionCierre?: string;
}

export async function updateEtapa(
  id: string,
  data: UpdateEtapaData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Oportunidad> {
  return client.oportunidad.update({ where: { id }, data });
}
