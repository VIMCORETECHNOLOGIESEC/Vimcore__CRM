/**
 * Tipos compartidos con el backend para el usuario autenticado.
 * `RolUsuario` refleja el enum Prisma `RolUsuario` (backend/prisma/schema.prisma).
 * Mantenerlos sincronizados manualmente: el frontend no comparte el cliente
 * de Prisma generado.
 */
export type RolUsuario = "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "VENDEDOR";

/**
 * `as const satisfies` (no solo `readonly RolUsuario[]`) para que el tipo se
 * infiera como tupla literal -- necesario para reutilizarla directamente en
 * `z.enum(ROLES_USUARIO)` (F7, formularios de alta/edición de usuario) sin
 * duplicar la lista de roles en un segundo lugar.
 */
export const ROLES_USUARIO = [
  "ADMINISTRADOR",
  "SUPERVISOR",
  "ASESOR",
  "VENDEDOR",
] as const satisfies readonly RolUsuario[];

/** Forma de `PublicUser` en `backend/src/services/auth.service.ts`. */
export interface AuthenticatedUser {
  id: string;
  nombre: string;
  correo: string;
  rol: RolUsuario;
}

/**
 * Vista administrativa de un usuario (F7, `GET/POST/PATCH /usuarios`).
 * Forma de `AdminUsuarioView` en `backend/src/repositories/usuario.repository.ts`
 * (`adminUsuarioSelect`) -- nunca incluye `passwordHash`. `creadoEn`/`actualizadoEn`
 * llegan como ISO 8601 (`Date` de Prisma serializado por `res.json`), igual
 * criterio que `Lead.ingresadoEn`.
 */
export interface AdminUsuario {
  id: string;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}
