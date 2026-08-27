import type { RolUsuario } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  // Bloque B (dual-login-routing): additivo, tomado tal cual del claim del
  // access token — presente solo cuando la sesión se emitió por el camino de
  // `Membresia`. `Usuario.rol` (arriba) sigue siendo la única fuente de
  // autorización; no participa en ninguna decisión de acceso en este cambio.
  membresiaId?: string;
  // Bloque C (D2, TenantContext): resuelto SIEMPRE server-side en
  // `requireAuthentication` releyendo `Membresia` — NUNCA el claim del JWT
  // (spec, "Client-supplied empresaId is ignored"). `null` = holding-wide
  // (`ROLES_ACCESO_TOTAL`: ADMINISTRADOR/SUPERVISOR, D2). Ningún consumidor
  // downstream lo usa todavía en esta etapa (Fase 1 / Stage 1) — Stage 2 lo
  // conecta a decisiones de acceso reales.
  empresaId: string | null;
}
