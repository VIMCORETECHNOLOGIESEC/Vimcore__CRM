import { Prisma, type Bridge, type CuentaPublicitaria, type EstadoBridge, type RedSocial } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

/**
 * D-M4 (diseño, tarea PR1.5): búsqueda del bridge por el hash de su clave de
 * API. La comparación en sí (`compareClaveBridge`) y su uso en el
 * middleware de autenticación son responsabilidad de PR3b.
 */
export async function findByClaveApiHash(
  claveApiHash: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Bridge | null> {
  return client.bridge.findUnique({ where: { claveApiHash } });
}

/**
 * Marca el momento del último lead recibido por un bridge
 * (`bridges.ultimo_lead_en`, docs/03-modelo-datos.md) — sostiene la
 * detección de bridges mudos (docs/05-bridges.md §8,
 * `services/bridge-mudo.service.ts`). Resetea `advertenciaMudoEnviada` a
 * `false` en el mismo `update`: un lead nuevo re-arma la detección de
 * silencio de 72h para el próximo tick (mismo espíritu anti-spam que
 * `Cita.recordatorioEnviado`).
 */
export async function touchUltimoLeadEn(
  bridgeId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.bridge.update({
    where: { id: bridgeId },
    data: { ultimoLeadEn: new Date(), advertenciaMudoEnviada: false },
  });
}

/**
 * Candidatos al trabajo programado "bridge sin actividad por 72h"
 * (docs/05-bridges.md §8, docs/06-modulos-backend.md): `estado = ACTIVO`,
 * `ultimoLeadEn` no nulo y anterior a `umbral` (= ahora - 72h, resuelto por
 * el caller en `services/bridge-mudo.service.ts`), y — "campañas activas"
 * — sin ninguna `CuentaPublicitaria` registrada o con al menos una
 * `activa = true`. `advertenciaMudoEnviada: false` es la misma guarda
 * anti-spam que `touchUltimoLeadEn` resetea: un bridge ya advertido no
 * vuelve a aparecer hasta que reciba un lead nuevo.
 *
 * Un bridge con `ultimoLeadEn IS NULL` (nunca recibió un lead) queda
 * excluido: no hay marca de referencia para medir "72h de silencio" sin una
 * columna de fecha de creación en `Bridge`.
 */
export async function findBridgesMudos(
  umbral: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<Bridge[]> {
  return client.bridge.findMany({
    where: {
      estado: "ACTIVO",
      ultimoLeadEn: { not: null, lt: umbral },
      advertenciaMudoEnviada: false,
      OR: [
        { cuentasPublicitarias: { none: {} } },
        { cuentasPublicitarias: { some: { activa: true } } },
      ],
    },
  });
}

/**
 * Guarda anti-duplicado atómica a nivel de fila — mismo espíritu que
 * `cita.repository.ts::marcarRecordatorioEnviado`: el `WHERE
 * advertenciaMudoEnviada: false` en el propio `updateMany` evita que dos
 * ticks concurrentes del job de bridges mudos registren la advertencia dos
 * veces para el mismo bridge.
 *
 * `umbral` (el mismo umbral de 72h resuelto por el caller,
 * `services/bridge-mudo.service.ts`) se revalida en este mismo `WHERE` —
 * no solo en el `SELECT` de candidatos de `findBridgesMudos` — para cerrar
 * la ventana de carrera entre "seleccionar candidatos" y "reclamar la
 * advertencia": si un lead real llega en el medio (`touchUltimoLeadEn` pone
 * `ultimoLeadEn = now()`), el bridge deja de matchear `ultimoLeadEn <
 * umbral` y el claim no tiene efecto, en vez de marcar una advertencia
 * falsa sobre un bridge que acaba de reactivarse.
 */
export async function markAdvertenciaMudoEnviada(
  ids: readonly string[],
  umbral: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<Prisma.BatchPayload> {
  if (ids.length === 0) return { count: 0 };
  return client.bridge.updateMany({
    where: {
      id: { in: [...ids] },
      advertenciaMudoEnviada: false,
      OR: [{ ultimoLeadEn: null }, { ultimoLeadEn: { lt: umbral } }],
    },
    data: { advertenciaMudoEnviada: true },
  });
}

export interface CreateBridgeData {
  redSocial: RedSocial;
  nombre: string;
  claveApiHash: string;
  // Bloque C (D4, Fase 2/Stage 2 — cutover bloqueante): obligatorio desde
  // que `Bridge.empresaId` es NOT NULL — `bridge.service.ts::createBridge`
  // ya lo exige en `CreateBridgeInput`.
  empresaId: string;
}

/**
 * D-M4-fundacion (diseño, tarea PR1.7): passthrough puro — el schema aplica
 * `estado = INACTIVO` por defecto (`@default(INACTIVO)`, `schema.prisma`).
 * La invariante "nace INACTIVO" (Requirement: Bridge creation starts
 * inactive) es responsabilidad de `bridge.service.ts` (PR2), no de este
 * repositorio: no forzarla aquí evita que un `update` reciba dos fuentes de
 * verdad sobre el default.
 */
export async function create(
  data: CreateBridgeData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Bridge> {
  return client.bridge.create({ data });
}

export interface FindManyBridgesOptions {
  skip: number;
  take: number;
}

export interface FindManyBridgesResult {
  bridges: BridgeConCuentas[];
  total: number;
}

/**
 * Fix (GET /bridges no pagina ni filtra): mismo patrón `Promise.all` de
 * `usuario.repository.ts::findUsuarios` — página + conteo total en
 * paralelo, un único `where` compartido entre ambas consultas.
 *
 * Orden estable por nombre (sin requerimiento de orden alternativo en esta
 * rebanada, igual que el `list()` original que reemplaza).
 *
 * Fix (2026-08-19, hallazgo de correlación end-to-end): el listado embebe
 * `cuentasPublicitarias` -- igual que `findById` -- porque el frontend
 * (`bridges.utils.ts::evaluateAvisoBridge`) calcula el aviso de "token
 * expirado/próximo a vencer" por FILA de la tabla, no solo en el detalle.
 * Sin este `include`, cada bridge del listado llegaba sin esa relación y
 * `evaluateAvisoBridge` rompía en runtime contra datos reales (`Cannot read
 * properties of undefined (reading 'some')`) -- nunca lo cubrió el mock del
 * frontend, que siempre construye un `Bridge` completo por contrato de tipo.
 * Esta invariante se preserva acá, con o sin filtros/paginación aplicados.
 */
export async function findMany(
  where: Prisma.BridgeWhereInput,
  options: FindManyBridgesOptions,
  client: PrismaClientOrTransaction = prisma,
): Promise<FindManyBridgesResult> {
  const [bridges, total] = await Promise.all([
    client.bridge.findMany({
      where,
      orderBy: { nombre: "asc" },
      include: { cuentasPublicitarias: true },
      skip: options.skip,
      take: options.take,
    }),
    client.bridge.count({ where }),
  ]);
  return { bridges, total };
}

export type BridgeConCuentas = Bridge & { cuentasPublicitarias: CuentaPublicitaria[] };

/** Requirement: Bridge detail embeds its accounts (`GET /bridges/:id`, diseño m4-bridges-crud-fundacion). */
export async function findById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<BridgeConCuentas | null> {
  return client.bridge.findUnique({ where: { id }, include: { cuentasPublicitarias: true } });
}

export interface UpdateBridgeData {
  nombre?: string;
  estado?: EstadoBridge;
  // bridgeApi (RedSocial.API_EXTERNA): `services/bridgeApi/configuracion.service.ts`
  // arma el merge (lectura + overlay) antes de llamar acá — este repositorio
  // sigue siendo passthrough puro, nunca decide qué mergear.
  configuracionJson?: Prisma.InputJsonValue;
  credencialExternaCifrada?: string;
}

/**
 * Passthrough puro — el whitelist de `estado` (excluye `TOKEN_EXPIRADO`/
 * `ERROR`, Requirement: PATCH /bridges/:id) y "al menos una clave" viven en
 * `bridges.schema.ts`/`bridge.service.ts` (PR2), nunca aquí.
 */
export async function update(
  id: string,
  data: UpdateBridgeData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Bridge> {
  return client.bridge.update({ where: { id }, data });
}

/**
 * Hard-delete físico. La decisión de si corresponde `BAJA_FISICA` (esta
 * función) o `BAJA_LOGICA` (`update` con `estado: INACTIVO`) según
 * `countLeadsRecibidos`, dentro de una única transacción, es de
 * `bridge.service.ts` (PR2, Requirement: Delete mode is decided by lead
 * count). Se llama `remove` porque `delete` es palabra reservada de JS.
 */
export async function remove(id: string, client: PrismaClientOrTransaction = prisma): Promise<void> {
  await client.bridge.delete({ where: { id } });
}

/** Único criterio autoritativo para el modo de borrado (Requirement: Delete mode…, nunca `ultimoLeadEn`). */
export async function countLeadsRecibidos(
  bridgeId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<number> {
  return client.leadRecibido.count({ where: { bridgeId } });
}

/** `POST /bridges/:id/clave` (regeneración): reemplaza el hash sin tocar `estado` (Requirement: Key regeneration…). */
export async function updateClaveApiHash(
  id: string,
  claveApiHash: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Bridge> {
  return client.bridge.update({ where: { id }, data: { claveApiHash } });
}

/**
 * bridgeApi (RedSocial.API_EXTERNA): candidatos al job de polling
 * (`jobs/bridgeApi/`) — todos los bridges de este tipo con `estado = ACTIVO`,
 * sin filtro de actividad reciente (a diferencia de `findBridgesMudos`, acá
 * se hace poll a TODOS los activos en cada tick, no solo a los silenciosos).
 * `configuracionJson`/`credencialExternaCifrada` viajan tal cual en el
 * `Bridge` devuelto — parsearlos contra `ConfiguracionBridgeApi` y descifrar
 * la credencial es responsabilidad del caller (`services/bridgeApi/`), no de
 * este repositorio.
 */
export async function findBridgesApiExternaActivos(
  client: PrismaClientOrTransaction = prisma,
): Promise<Bridge[]> {
  return client.bridge.findMany({
    where: { redSocial: "API_EXTERNA", estado: "ACTIVO" },
  });
}

/**
 * `GET /bridges/redes-activas` (Requirement: Network catalogs are
 * enum-derived and deduplicated): "no eliminada" significa que la fila del
 * bridge todavía existe (sobrevive a `BAJA_LOGICA`/`estado=INACTIVO`, solo
 * desaparece con `BAJA_FISICA`) — no filtra por `estado=ACTIVO`, ver spec
 * scenario "Active networks list has no duplicates" y el requirement text
 * literal ("at least one non-deleted bridge").
 */
export async function listRedesActivas(client: PrismaClientOrTransaction = prisma): Promise<RedSocial[]> {
  const filas = await client.bridge.findMany({
    distinct: ["redSocial"],
    select: { redSocial: true },
  });
  return filas.map((fila) => fila.redSocial);
}
