/**
 * Tipos compartidos con el backend para el usuario autenticado.
 * `RolUsuario` refleja el enum Prisma `RolUsuario` (backend/prisma/schema.prisma).
 * Mantenerlos sincronizados manualmente: el frontend no comparte el cliente
 * de Prisma generado.
 */
export type RolUsuario = "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "VENDEDOR";

export const ROLES_USUARIO: readonly RolUsuario[] = [
  "ADMINISTRADOR",
  "SUPERVISOR",
  "ASESOR",
  "VENDEDOR",
];

/** Forma de `PublicUser` en `backend/src/services/auth.service.ts`. */
export interface AuthenticatedUser {
  id: string;
  nombre: string;
  correo: string;
  rol: RolUsuario;
}
