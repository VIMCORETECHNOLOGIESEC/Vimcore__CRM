import type { Membresia, RolMembresia } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

/**
 * Bloque B (Fase 2, spec dual-login-routing): segundo camino de resolución
 * de credenciales de `auth.service.ts::login`, tras un miss en
 * `Usuario.correo`. Solo `activa=true` — una Membresia dada de baja
 * (`Removal is a soft toggle`) nunca autentica, aunque la fila persista.
 */
export async function findByEmail(
  correo: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Membresia | null> {
  return client.membresia.findFirst({ where: { correo, activa: true } });
}

/**
 * Fase 2 (diseño, "Shadow authorizer call sites"): hot path del comparador en
 * sombra — "active memberships for this usuarioId", respaldado por
 * `@@index([usuarioId, activa])` en el schema. Nunca decide autorización por
 * sí sola en este cambio (shadow, no cutover).
 */
export async function findActivasByUsuarioId(
  usuarioId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Membresia[]> {
  return client.membresia.findMany({ where: { usuarioId, activa: true } });
}

export async function findById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Membresia | null> {
  return client.membresia.findUnique({ where: { id } });
}

/**
 * Spec (dual-login-routing, "Cross-table email collision blocked"): guarda
 * transaccional de unicidad de aplicación entre `Usuario.correo` y
 * `Membresia.correo` — ninguna restricción de BD cruza ambas tablas. Debe
 * invocarse SIEMPRE dentro de la misma transacción que el INSERT/UPDATE que
 * escribe el nuevo `Membresia.correo`, para que el chequeo y la escritura
 * vean el mismo snapshot.
 *
 * Sin consumidor en este cambio (diseño, decisión "Cross-table correo
 * uniqueness guard"): el backfill de Fase 1 deja `Membresia.correo` siempre
 * NULL, así que nada la invoca todavía. Se implementa ahora para que un
 * futuro cambio que sí escriba `Membresia.correo` la reutilice en vez de
 * re-derivar el chequeo (y arriesgar omitirlo).
 */
export interface CreateMembresiaData {
  usuarioId: string;
  empresaId: string;
  rol: RolMembresia;
  habilitadoParaVenta: boolean;
}

/**
 * Bloque C follow-up (D2 gap closure, spec "Request-scoped tenant context"):
 * cierra el hueco que dejó Fase 1/Stage 1 — hasta este cambio, ningún camino
 * de código creaba una `Membresia` junto con un `Usuario` nuevo, así que
 * `TenantContext` nunca podía rechazar de verdad sin romper el alta de
 * usuarios `ASESOR`/`VENDEDOR`. `usuarios.service.ts::createUsuario` invoca
 * esto en la MISMA transacción que el `usuario.create` (mismo criterio
 * atómico que `deactivateUsuario` con `revokeAllForUser`).
 */
export async function createMembresia(
  data: CreateMembresiaData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Membresia> {
  return client.membresia.create({
    data: {
      usuarioId: data.usuarioId,
      empresaId: data.empresaId,
      rol: data.rol,
      habilitadoParaVenta: data.habilitadoParaVenta,
      activa: true,
    },
  });
}

export async function assertCorreoDisponible(
  correo: string,
  client: PrismaClientOrTransaction,
): Promise<void> {
  const [usuarioExistente, membresiaExistente] = await Promise.all([
    client.usuario.findUnique({ where: { correo }, select: { id: true } }),
    client.membresia.findUnique({ where: { correo }, select: { id: true } }),
  ]);

  if (usuarioExistente !== null || membresiaExistente !== null) {
    throw new AppError("correo_no_disponible", 409, "El correo ya está en uso");
  }
}
