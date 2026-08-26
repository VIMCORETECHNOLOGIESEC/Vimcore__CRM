import type { RolUsuario } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  // Bloque B (dual-login-routing): additivos, tomados tal cual del claim del
  // access token — presentes solo cuando la sesión se emitió por el camino
  // de `Membresia`. `Usuario.rol` (arriba) sigue siendo la única fuente de
  // autorización; estos dos campos no participan en ninguna decisión de
  // acceso en este cambio (shadow, no cutover).
  membresiaId?: string;
  empresaId?: string;
}
