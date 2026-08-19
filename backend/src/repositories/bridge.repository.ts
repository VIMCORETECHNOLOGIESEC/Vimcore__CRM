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
export async function marcarAdvertenciaMudoEnviada(
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

/** Orden estable por nombre — no hay requerimiento de paginación en esta rebanada. */
export async function list(client: PrismaClientOrTransaction = prisma): Promise<Bridge[]> {
  return client.bridge.findMany({ orderBy: { nombre: "asc" } });
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
 * count). Se llama `eliminar` porque `delete` es palabra reservada de JS.
 */
export async function eliminar(id: string, client: PrismaClientOrTransaction = prisma): Promise<void> {
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
