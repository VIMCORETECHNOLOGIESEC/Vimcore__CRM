import type { RolUsuario } from "@prisma/client";

export interface UsuarioAcceso {
  id: string;
  rol: RolUsuario;
}

/** Subconjunto exacto de `Lead` que las reglas de acceso necesitan. */
export interface LeadAcceso {
  asesorId: string | null;
  vendedorId: string | null;
}

const ROLES_ACCESO_TOTAL: readonly RolUsuario[] = ["ADMINISTRADOR", "SUPERVISOR"];

/**
 * DD5 (diseño M5): autorización por recurso, no expresable con
 * `requireRole(...)`. Vive en el servicio, no en middleware — las rutas
 * solo montan `requireAuthentication` y el `where` de rol se inyecta aquí,
 * nunca desde query params del cliente.
 *
 * Lectura (spec, "Detalle con verificación de acceso"): Admin/Supervisor
 * siempre; además `asesorId` o `vendedorId` del lead — el asesor que
 * traspasó un lead a un vendedor conserva acceso de lectura (D4).
 */
export function canRead(usuario: UsuarioAcceso, lead: LeadAcceso): boolean {
  if (ROLES_ACCESO_TOTAL.includes(usuario.rol)) return true;
  return usuario.id === lead.asesorId || usuario.id === lead.vendedorId;
}

/**
 * Edición (spec, "Transición de etapa transaccional"): Admin/Supervisor
 * siempre; si no, solo el responsable operativo actual —
 * `vendedorId ?? asesorId` (D4). Tras un traspaso, el asesor original
 * pierde edición aunque conserve lectura.
 */
export function canEdit(usuario: UsuarioAcceso, lead: LeadAcceso): boolean {
  if (ROLES_ACCESO_TOTAL.includes(usuario.rol)) return true;
  const responsableOperativo = lead.vendedorId ?? lead.asesorId;
  return responsableOperativo !== null && usuario.id === responsableOperativo;
}
