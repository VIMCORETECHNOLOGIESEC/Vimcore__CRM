import type { Prisma, RolUsuario, Usuario } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";
import { revokeAllForUser } from "./refresh-token.repository.js";

/**
 * Lecturas usadas por `auth.service.ts` (PR1). `passwordHash` se incluye
 * porque `login` necesita compararlo; los endpoints de `usuarios` (PR2) usan
 * `select` explícito sin este campo — ver `adminUsuarioSelect` abajo.
 */
export async function findById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Usuario | null> {
  return client.usuario.findUnique({ where: { id } });
}

export async function findByEmail(correo: string): Promise<Usuario | null> {
  return prisma.usuario.findUnique({ where: { correo } });
}

/**
 * Vista pública administrativa: nunca incluye `passwordHash`. `select`
 * explícito (no spread del modelo completo) por diseño — evita que un futuro
 * campo sensible se filtre por accidente.
 */
const adminUsuarioSelect = {
  id: true,
  nombre: true,
  correo: true,
  rol: true,
  activo: true,
  creadoEn: true,
  actualizadoEn: true,
} satisfies Prisma.UsuarioSelect;

export type AdminUsuarioView = Prisma.UsuarioGetPayload<{ select: typeof adminUsuarioSelect }>;

export interface CreateUsuarioData {
  nombre: string;
  correo: string;
  passwordHash: string;
  rol: RolUsuario;
}

export interface UpdateUsuarioData {
  nombre?: string;
  correo?: string;
  passwordHash?: string;
  rol?: RolUsuario;
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2025"
  );
}

export async function createUsuario(data: CreateUsuarioData): Promise<AdminUsuarioView> {
  return prisma.usuario.create({ data, select: adminUsuarioSelect });
}

export interface FindUsuariosOptions {
  skip: number;
  take: number;
  orderBy: Prisma.UsuarioOrderByWithRelationInput;
}

export interface FindUsuariosResult {
  usuarios: AdminUsuarioView[];
  total: number;
}

/**
 * F7 (admin de usuarios): mismo patrón `Promise.all` de
 * `lead.repository.findMany` — página + conteo total en paralelo, un único
 * `where` compartido entre ambas consultas.
 */
export async function findUsuarios(
  where: Prisma.UsuarioWhereInput,
  options: FindUsuariosOptions,
): Promise<FindUsuariosResult> {
  const [usuarios, total] = await Promise.all([
    prisma.usuario.findMany({
      where,
      select: adminUsuarioSelect,
      skip: options.skip,
      take: options.take,
      orderBy: options.orderBy,
    }),
    prisma.usuario.count({ where }),
  ]);
  return { usuarios, total };
}

export async function findPublicById(id: string): Promise<AdminUsuarioView | null> {
  return prisma.usuario.findUnique({ where: { id }, select: adminUsuarioSelect });
}

export async function updateUsuario(
  id: string,
  data: UpdateUsuarioData,
): Promise<AdminUsuarioView | null> {
  try {
    return await prisma.usuario.update({ where: { id }, data, select: adminUsuarioSelect });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * F3/F4 (diseño D-A1, catálogo de responsables): proyección estricta
 * `{id,nombre,rol}` — deliberadamente MÁS angosta que `CandidatoRol`
 * (que expone `ultimaAsignacionEn`, un detalle interno del algoritmo de
 * asignación que el catálogo de UI no necesita ni debe filtrar).
 */
const responsableSelect = {
  id: true,
  nombre: true,
  rol: true,
} satisfies Prisma.UsuarioSelect;

export type ResponsableView = Prisma.UsuarioGetPayload<{ select: typeof responsableSelect }>;

/**
 * F3/F4 (diseño D-A1): activos únicamente, sin filtro por equipo (spec).
 * No reusa `findActivosPorRol` porque ese select es específico del algoritmo
 * de asignación (`ultimaAsignacionEn`, sin `nombre`) — dos consumidores con
 * proyecciones distintas, mismo filtro `where`.
 */
export async function findResponsablesActivosPorRol(rol: RolUsuario): Promise<ResponsableView[]> {
  return prisma.usuario.findMany({
    where: { rol, activo: true },
    select: responsableSelect,
  });
}

/** M6 (diseño, "Cálculo de menor carga activa — consulta exacta"). */
export interface CandidatoRol {
  id: string;
  ultimaAsignacionEn: Date | null;
}

/**
 * M6 (diseño, DD4): tx-aware — las funciones YA existentes de este
 * repositorio (arriba) usan el `prisma` de módulo y NO se refactorizan
 * (fuera de alcance, rompería M2 sin necesidad). Solo las funciones NUEVAS
 * de M6 aceptan `PrismaClientOrTransaction`.
 */
export async function findActivosPorRol(
  rol: RolUsuario,
  client: PrismaClientOrTransaction = prisma,
): Promise<CandidatoRol[]> {
  return client.usuario.findMany({
    where: { rol, activo: true },
    select: { id: true, ultimaAsignacionEn: true },
  });
}

/**
 * M6 (diseño, D10): actualiza `ultimaAsignacionEn` del receptor en los
 * cuatro caminos de asignación (automática, `asignar`, `reasignar`,
 * `traspasar`) — sin esto el desempate FIFO degenera.
 */
export async function updateUltimaAsignacion(
  id: string,
  ahora: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.usuario.update({ where: { id }, data: { ultimaAsignacionEn: ahora } });
}

/**
 * Fix bulk writes (`deactivateUsuario`, M2): variante en lote de
 * `updateUltimaAsignacion` — un solo `updateMany` para todos los receptores
 * distintos de una reasignación de cartera masiva, en vez de un `update`
 * awaited por receptor/lead. Si `ids` está vacío, no ejecuta ninguna
 * consulta.
 */
export async function updateUltimaAsignacionBulk(
  ids: readonly string[],
  ahora: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  if (ids.length === 0) return;
  await client.usuario.updateMany({ where: { id: { in: [...ids] } }, data: { ultimaAsignacionEn: ahora } });
}

/**
 * D3: baja lógica — `activo=false` **y** revocación de todos los refresh
 * tokens del usuario, en la MISMA transacción (nunca dos pasos separados: si
 * el proceso muriera entre medias, quedaría una sesión activa para un
 * usuario desactivado). Reutiliza `revokeAllForUser` de
 * `refresh-token.repository.ts` pasándole el cliente de transacción — no
 * duplica la lógica de revocación en cascada (D-D ya la implementa).
 *
 * M2 (baja lógica con reasignación obligatoria de cartera activa): tx-aware
 * — YA NO abre su propia `prisma.$transaction`. `usuarios.service::
 * deactivateUsuario` es ahora quien abre la transacción de punta a punta
 * (lectura del usuario → reasignación de cartera si aplica → esta escritura),
 * porque si la reasignación de cartera falla (sin candidato disponible, D3),
 * la baja NO debe persistirse — dos transacciones separadas no podrían
 * garantizar ese todo-o-nada. El único llamador (`usuarios.service.ts`) ya
 * validó existencia con `findById` dentro de la misma `tx` antes de llegar
 * acá, así que esta función asume que `id` existe y no vuelve a atrapar
 * `P2025`.
 */
export async function deactivateUsuario(
  id: string,
  client: PrismaClientOrTransaction,
): Promise<AdminUsuarioView> {
  const updated = await client.usuario.update({
    where: { id },
    data: { activo: false },
    select: adminUsuarioSelect,
  });
  await revokeAllForUser(id, client);
  return updated;
}

/**
 * M9 (`metricas.service.ts::getPorAsesor`, docs/08 §3.2): rótulo de nombre
 * para cada `responsableId` que devuelve la agregación SQL cruda de
 * `metricas.repository.ts::getPorAsesorConSla` — esa consulta solo conoce
 * ids (Prisma no permite `include`/`select` sobre un `$queryRaw`). Un único
 * viaje por lote, mismo criterio que `lead.repository.ts::
 * countCargaActivaPorResponsable` (recibe la lista completa de ids, no N+1).
 */
export async function findNombresPorIds(
  ids: readonly string[],
  client: PrismaClientOrTransaction = prisma,
): Promise<Map<string, { nombre: string; rol: RolUsuario; activo: boolean }>> {
  if (ids.length === 0) return new Map();
  const filas = await client.usuario.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, nombre: true, rol: true, activo: true },
  });
  return new Map(filas.map((f) => [f.id, { nombre: f.nombre, rol: f.rol, activo: f.activo }]));
}
