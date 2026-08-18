import { httpClient } from "@/api/httpClient";
import type { AuthenticatedUser } from "@/tipos/usuario";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/** `POST /auth/login` — ver `backend/src/controllers/auth.controller.ts`. */
export function loginApi(correo: string, password: string): Promise<LoginResponse> {
  return httpClient.post<LoginResponse>(
    "/auth/login",
    { correo, password },
    { skipAuth: true },
  );
}

/**
 * `POST /auth/logout` — requiere `Authorization`. Idempotente en el backend
 * (D-E): nunca revela si el refresh token pertenecía a otra sesión.
 */
export function logoutApi(refreshToken: string): Promise<void> {
  return httpClient.post<void>("/auth/logout", { refreshToken });
}

/**
 * `GET /auth/perfil` — requiere `Authorization`. Usado por `AuthProvider`
 * para rehidratar el usuario al arrancar la app a partir del refresh token
 * persistido (F2, "Persistencia de sesión").
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

export type { LoginResponse, RefreshResponse };
