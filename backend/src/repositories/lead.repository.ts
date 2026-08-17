import type { Lead, Prisma } from "@prisma/client";
import { EtapaLead } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

/**
 * §2 (docs/02-reglas-negocio.md): un lead está "abierto" mientras su etapa
 * no sea una etapa de cierre. `VENTA`/`NO_VENTA` son las dos únicas etapas
 * de cierre — cualquier otra cuenta como abierta.
 *
 * M6 (diseño, "Cálculo de menor carga activa"): exportada para que
 * `countCargaActivaPorResponsable` la reutilice en vez de declarar una
 * cuarta copia (ya existe también como `ETAPAS_TERMINALES` en
 * `leads.service.ts`).
 */
export const ETAPAS_CERRADAS = [EtapaLead.VENTA, EtapaLead.NO_VENTA] as const;

/**
 * spec (Integración F3/F4, "Respuesta enriquecida con relaciones"): `GET
 * /leads` y `GET /leads/:id` MUST incluir `cliente`/`asesor`/`vendedor`
 * anidados. Un único `include` compartido por `findById`/`findMany` — mismo
 * patrón `satisfies` que `usuario.repository.ts::adminUserSelect`.
 */
const LEAD_RELACIONES_INCLUDE = {
  cliente: true,
  asesor: true,
  vendedor: true,
} as const satisfies Prisma.LeadInclude;

export type LeadConRelaciones = Prisma.LeadGetPayload<{ include: typeof LEAD_RELACIONES_INCLUDE }>;

export async function findLeadAbierto(
  clienteId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Lead | null> {
  return client.lead.findFirst({
    where: { clienteId, etapa: { notIn: [...ETAPAS_CERRADAS] } },
  });
}

/**
 * Ordenado por `cerradoEn desc` (índice `(cliente_id, cerrado_en DESC)`,
 * diseño M3): el decisor solo necesita el cierre más reciente para calcular
 * la ventana de reingreso de 90 días.
 */
export async function findUltimoLeadCerrado(
  clienteId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Lead | null> {
  return client.lead.findFirst({
    where: { clienteId, etapa: { in: [...ETAPAS_CERRADAS] } },
    orderBy: { cerradoEn: "desc" },
  });
}

export interface CreateLeadData {
  clienteId: string;
  origen: Lead["origen"];
  ingresadoEn: Date;
  /**
   * M5 (DD1, diseño M5): `deduplicacion.service.ts::createLead` nunca los
   * pasaba pese a que `LeadEntrante` (M4) ya los traía — quedaban NULL para
   * siempre. Opcionales para no romper llamadas existentes que no los
   * proveen (p. ej. pruebas de M3 que no simulan M4).
   */
  redSocial?: Lead["redSocial"];
  payloadOriginal?: Prisma.InputJsonValue;
  camposDinamicos?: Prisma.InputJsonValue;
}

export async function createLead(
  data: CreateLeadData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Lead> {
  return client.lead.create({ data });
}

export interface UpdateSemaforoData {
  semaforo: Lead["semaforo"];
  /**
   * PR3 (M5): opcional para el fijado directo de color en etapas terminales
   * (VENTA=VERDE/NO_VENTA=ROJO, D6) — esas transiciones no pasan por el
   * motor de puntuación (`applyFormulario` las rechaza, PR2) y no deben
   * tocar `puntuacion`. Cuando se omite, Prisma no incluye la columna en el
   * `UPDATE` (un valor `undefined` en `data` significa "no tocar", distinto
   * de `null`).
   */
  puntuacion?: Lead["puntuacion"];
}

/**
 * M5 (DD4, diseño): escritura del motor de semáforo — solo toca
 * `semaforo`/`puntuacion`, nunca `etapa` (D16: recalificar no mueve la
 * etapa del lead).
 */
export async function updateSemaforo(
  id: string,
  data: UpdateSemaforoData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Lead> {
  return client.lead.update({ where: { id }, data });
}

/**
 * PR3 (diseño M5, detalle con verificación de acceso): `null` es un
 * resultado válido — el controller lo traduce a 404, nunca lanza aquí.
 */
export async function findById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<LeadConRelaciones | null> {
  return client.lead.findUnique({ where: { id }, include: LEAD_RELACIONES_INCLUDE });
}

export interface FindManyLeadsOptions {
  skip: number;
  take: number;
  orderBy: Prisma.LeadOrderByWithRelationInput;
  /**
   * spec ("Búsqueda libre sobre datos de cliente"): texto libre aplicado
   * como OR ILIKE sobre datos del cliente, nunca sobre campaña (D-2).
   */
  busqueda?: string;
}

export interface FindManyLeadsResult {
  leads: LeadConRelaciones[];
  total: number;
}

/**
 * spec ("Búsqueda libre sobre datos de cliente"): OR ILIKE sobre
 * `cliente.nombre`/`telefonoOriginal`/`telefonoNormalizado`/correo
 * principal. Vive en el repositorio (no en `leads.service.ts::buildWhere`)
 * porque expresa un filtro sobre la relación `cliente`, no una columna
 * propia de `Lead`. Campaña queda deliberadamente fuera — ya tiene su propio
 * filtro (`campania`) contra `payloadOriginal`.
 */
function buildBusquedaClienteWhere(busqueda: string): Prisma.ClienteWhereInput {
  return {
    OR: [
      { nombre: { contains: busqueda, mode: "insensitive" } },
      { telefonoOriginal: { contains: busqueda, mode: "insensitive" } },
      { telefonoNormalizado: { contains: busqueda, mode: "insensitive" } },
      {
        correos: {
          some: { esPrincipal: true, correoNormalizado: { contains: busqueda, mode: "insensitive" } },
        },
      },
    ],
  };
}

/**
 * PR3 (spec, "Filtros, paginación y orden del listado"): el `where` completo
 * —incluida la inyección del filtro de rol, DD5— lo construye
 * `leads.service.ts`; este repositorio solo ejecuta la consulta. `total` es
 * el conteo real bajo el mismo `where`, no el tamaño de la página.
 */
export async function findMany(
  where: Prisma.LeadWhereInput,
  options: FindManyLeadsOptions,
  client: PrismaClientOrTransaction = prisma,
): Promise<FindManyLeadsResult> {
  const whereFinal: Prisma.LeadWhereInput = options.busqueda
    ? { ...where, cliente: buildBusquedaClienteWhere(options.busqueda) }
    : where;

  const [leads, total] = await Promise.all([
    client.lead.findMany({
      where: whereFinal,
      skip: options.skip,
      take: options.take,
      orderBy: options.orderBy,
      include: LEAD_RELACIONES_INCLUDE,
    }),
    client.lead.count({ where: whereFinal }),
  ]);
  return { leads, total };
}

export interface UpdateEtapaData {
  etapa: EtapaLead;
  /** Solo presentes en una transición hacia VENTA/NO_VENTA (D13). */
  cerradoEn?: Date;
  montoVenta?: Prisma.Decimal.Value;
  productoServicio?: string;
  formaPago?: Lead["formaPago"];
  observacionCierre?: string;
}

/**
 * PR3 (diseño M5, DD7): una sola escritura para `etapa` + los campos de
 * cierre de la etapa terminal correspondiente, dentro de la transacción de
 * `leads.service::transitionEtapa`.
 */
export async function updateEtapa(
  id: string,
  data: UpdateEtapaData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Lead> {
  return client.lead.update({ where: { id }, data });
}

export type PoolAsignacion = "ASESOR" | "VENDEDOR";

/**
 * M6 (diseño, DD8): `groupBy` de Prisma solo devuelve grupos CON filas — un
 * candidato con carga activa 0 está AUSENTE de `filas`, no presente con
 * `_count: 0`. El llamador (`asignacion.service::selectResponsable`)
 * completa los ausentes con 0; esta función nunca los descarta ni asume que
 * `groupBy` cubre todos los candidatos.
 *
 * REFACTOR (tarea 1.19): `groupBy` exige literales estáticos en `by` para su
 * tipado, así que las dos ramas de consulta quedan explícitas (el intento de
 * unificarlas con un `campo` dinámico rompe la sobrecarga de tipos de
 * Prisma); lo que se unifica es el post-procesamiento (DD8: completar
 * ausentes queda a cargo del llamador, esta función solo mapea filas
 * presentes) en `groupByRowsToCountMap`, sin duplicarlo. Utilidad de
 * infraestructura genérica sin carga de dominio — nombre en inglés puro.
 */
function groupByRowsToCountMap<K extends string>(
  filas: ReadonlyArray<{ _count: { _all: number } } & Record<K, string | null>>,
  campo: K,
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const fila of filas) {
    const id = fila[campo];
    if (id !== null) mapa.set(id, fila._count._all);
  }
  return mapa;
}

export async function countCargaActivaPorResponsable(
  pool: PoolAsignacion,
  candidatoIds: readonly string[],
  client: PrismaClientOrTransaction = prisma,
): Promise<Map<string, number>> {
  if (candidatoIds.length === 0) return new Map();

  if (pool === "ASESOR") {
    const filas = await client.lead.groupBy({
      by: ["asesorId"],
      where: { asesorId: { in: [...candidatoIds] }, etapa: { notIn: [...ETAPAS_CERRADAS] } },
      _count: { _all: true },
    });
    return groupByRowsToCountMap(filas, "asesorId");
  }

  const filas = await client.lead.groupBy({
    by: ["vendedorId"],
    where: { vendedorId: { in: [...candidatoIds] }, etapa: { notIn: [...ETAPAS_CERRADAS] } },
    _count: { _all: true },
  });
  return groupByRowsToCountMap(filas, "vendedorId");
}

export interface AssignResponsableData {
  pool: PoolAsignacion;
  responsableId: string;
  slaInicioEn: Date;
}

/**
 * M6 (diseño, DD1 — "idx_leads_sla SÍ aterrizó"): forma EXACTA del índice
 * parcial `idx_leads_sla` (`WHERE cerrado_en IS NULL`) — `cerradoEn: null`
 * primero, `slaInicioEn` como rango después. Misma forma que
 * `leads.service.ts::buildWhere` para `?estadoSla=atrasado`. Un lead con
 * `slaInicioEn = null` nunca entra: SQL `NULL <= X` es NULL (falso), Prisma
 * lo traduce igual — el cron nunca lo marca atrasado (D3).
 */
export async function findAtrasadosAbiertos(
  fronteraAtrasado: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<Lead[]> {
  return client.lead.findMany({
    where: { cerradoEn: null, slaInicioEn: { lte: fronteraAtrasado } },
  });
}

/**
 * M6 (diseño, contrato `applyAsignacion`): una de las tres escrituras
 * atómicas de la operación de asignación (D11) — escribe `asesorId` o
 * `vendedorId` según `pool` más el reinicio de `slaInicioEn`, nunca ambos
 * campos de responsable a la vez.
 */
export async function assignResponsable(
  id: string,
  data: AssignResponsableData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Lead> {
  return client.lead.update({
    where: { id },
    data:
      data.pool === "ASESOR"
        ? { asesorId: data.responsableId, slaInicioEn: data.slaInicioEn }
        : { vendedorId: data.responsableId, slaInicioEn: data.slaInicioEn },
  });
}
