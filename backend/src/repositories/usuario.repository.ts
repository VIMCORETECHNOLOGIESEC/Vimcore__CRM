import type { Usuario } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * Solo lecturas en PR1 (M2 CRUD llega en PR2). `passwordHash` se incluye
 * porque `auth.service.login` necesita compararlo; los endpoints de
 * `usuarios` (PR2) usan `select` explícito sin este campo.
 */
export async function findById(id: string): Promise<Usuario | null> {
  return prisma.usuario.findUnique({ where: { id } });
}

export async function findByEmail(correo: string): Promise<Usuario | null> {
  return prisma.usuario.findUnique({ where: { correo } });
}
