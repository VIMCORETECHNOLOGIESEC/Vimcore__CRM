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

export type { LoginResponse, RefreshResponse };
