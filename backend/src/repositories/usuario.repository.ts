import type { Prisma, RolUsuario, Usuario } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { revokeAllForUser } from "./refresh-token.repository.js";

/**
 * Lecturas usadas por `auth.service.ts` (PR1). `passwordHash` se incluye
 * porque `login` necesita compararlo; los endpoints de `usuarios` (PR2) usan
 * `select` explícito sin este campo — ver `adminUserSelect` abajo.
 */
export async function findById(id: string): Promise<Usuario | null> {
  return prisma.usuario.findUnique({ where: { id } });
}

export async function findByEmail(correo: string): Promise<Usuario | null> {
  return prisma.usuario.findUnique({ where: { correo } });
}

/**
 * Vista pública administrativa: nunca incluye `passwordHash`. `select`
 * explícito (no spread del modelo completo) por diseño — evita que un futuro
 * campo sensible se filtre por accidente.
 */
const adminUserSelect = {
  id: true,
  nombre: true,
  correo: true,
  rol: true,
  activo: true,
  creadoEn: true,
  actualizadoEn: true,
} satisfies Prisma.UsuarioSelect;

export type AdminUserView = Prisma.UsuarioGetPayload<{ select: typeof adminUserSelect }>;

export interface CreateUserData {
  nombre: string;
  correo: string;
  passwordHash: string;
  rol: RolUsuario;
}

export interface UpdateUserData {
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

export async function createUser(data: CreateUserData): Promise<AdminUserView> {
  return prisma.usuario.create({ data, select: adminUserSelect });
}

export async function findAllUsers(): Promise<AdminUserView[]> {
  return prisma.usuario.findMany({
    select: adminUserSelect,
    orderBy: { creadoEn: "asc" },
  });
}

export async function findPublicById(id: string): Promise<AdminUserView | null> {
  return prisma.usuario.findUnique({ where: { id }, select: adminUserSelect });
}

export async function updateUser(
  id: string,
  data: UpdateUserData,
): Promise<AdminUserView | null> {
  try {
    return await prisma.usuario.update({ where: { id }, data, select: adminUserSelect });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * D3: baja lógica — `activo=false` **y** revocación de todos los refresh
 * tokens del usuario, en la misma transacción (nunca dos pasos separados: si
 * el proceso muriera entre medias, quedaría una sesión activa para un
 * usuario desactivado). Reutiliza `revokeAllForUser` de
 * `refresh-token.repository.ts` pasándole el cliente de transacción — no
 * duplica la lógica de revocación en cascada (D-D ya la implementa).
 */
export async function deactivateUser(id: string): Promise<AdminUserView | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.usuario.update({
        where: { id },
        data: { activo: false },
        select: adminUserSelect,
      });
      await revokeAllForUser(id, tx);
      return updated;
    });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}
