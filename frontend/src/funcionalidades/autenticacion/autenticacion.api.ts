import { getGatewayBaseUrl, httpClient } from "@/api/httpClient";
import type { AuthenticatedUser } from "@/tipos/usuario";

/**
 * Cierre de sesión de la plataforma: `POST /auth/logout` del gateway (origen
 * del gateway, NO bajo `/crm`), con la cookie `gw_session`. Destruye la sesión
 * y limpia la cookie. Un fallo no es accionable: el llamador redirige igual.
 */
export async function logoutApi(): Promise<void> {
  await fetch(`${getGatewayBaseUrl()}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

/**
 * `GET /auth/perfil` (vía gateway `/crm/auth/perfil`) — requiere la sesión de
 * plataforma. Usado por `AuthProvider` para hidratar al usuario al arrancar la
 * app; el CRM resuelve rol y scope desde su propia BD.
 */
export function getPerfilApi(): Promise<AuthenticatedUser> {
  return httpClient.get<AuthenticatedUser>("/auth/perfil");
}

/**
 * Cambio de la propia contraseña (F2, "Pantalla de perfil con cambio de
 * contraseña").
 *
 * DECISIÓN (brecha de backend, documentada también en la nota de progreso de
 * F2 en `docs/07-modulos-frontend.md`): el backend no expone un endpoint de
 * autoservicio para esto. El único endpoint que toca `password` es
 * `PATCH /usuarios/:id` (`backend/src/routes/usuarios.routes.ts`), protegido
 * con `requireRole("ADMINISTRADOR")` y sin verificación de la contraseña
 * actual (fue diseñado para que un administrador reescriba la contraseña de
 * otro usuario, no para autoservicio). Se reutiliza aquí pasando el propio
 * `id` del usuario autenticado -- hoy solo funciona para el rol
 * ADMINISTRADOR; para SUPERVISOR/ASESOR/VENDEDOR el backend responde 403 con
 * un mensaje ya accionable (`getErrorMessage`). Se necesita un endpoint
 * propio (p. ej. `PATCH /auth/perfil/password`, exigiendo la contraseña
 * actual) para que el resto de los roles puedan cambiar su contraseña.
 */
export function changePasswordApi(userId: string, password: string): Promise<void> {
  return httpClient.patch<unknown>(`/usuarios/${userId}`, { password }).then(() => undefined);
}
