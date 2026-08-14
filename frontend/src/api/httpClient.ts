/**
 * Cliente HTTP para la API del backend (AGENTS.md §4, docs/07 F1).
 *
 * Cobertura de TDD (AGENTS.md §5): este módulo contiene lógica no trivial
 * (inyección de JWT, cola de refresco ante 401, deduplicación de refrescos
 * concurrentes, mapeo de errores) -- ver `frontend/tests/httpClient.test.ts`.
 *
 * Contrato verificado contra `backend/src/controllers/auth.controller.ts`,
 * `backend/src/services/auth.service.ts` y
 * `backend/src/middlewares/error-handler.middleware.ts`:
 * - Login: `POST /auth/login` con `{ correo, password }` → `{ accessToken,
 *   refreshToken, user }`.
 * - Refresco: `POST /auth/refresh` con `{ refreshToken }` en el cuerpo (no
 *   cookie) → `{ accessToken, refreshToken }`. Rotación en cada uso: el
 *   backend revoca toda la familia si detecta reutilización de un
 *   `refreshToken` ya usado, por eso `refreshAccessToken()` deduplica
 *   refrescos concurrentes en una única promesa compartida.
 * - Autorización: header `Authorization: Bearer <accessToken>`.
 * - Errores de dominio: `{ code, message }` con `message` ya accionable en
 *   español -- se reexpone tal cual en `ApiError.message`.
 */

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

/** Mensaje genérico y accionable cuando no hay uno más específico del backend. */
const GENERIC_ERROR_MESSAGE =
  "Ocurrió un error inesperado. Intentá nuevamente en unos segundos.";
const NETWORK_ERROR_MESSAGE =
  "No se pudo conectar con el servidor. Verificá tu conexión e intentá nuevamente.";
const SESSION_EXPIRED_MESSAGE = "Tu sesión expiró. Iniciá sesión nuevamente.";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Estado de tokens en memoria (módulo singleton). F1 no persiste la sesión
 * entre recargas -- eso es alcance explícito de F2 ("Persistencia de sesión
 * y cierre automático al expirar el refresh", docs/07). El diseño con
 * getters/setters permite que F2 conecte un backing store persistente sin
 * tocar el resto de este archivo.
 */
let accessToken: string | null = null;
let refreshTokenValue: string | null = null;

export function setTokens(tokens: TokenPair | null): void {
  accessToken = tokens?.accessToken ?? null;
  refreshTokenValue = tokens?.refreshToken ?? null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshTokenValue;
}

type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

/** Registrado por `AuthProvider` para limpiar el estado de sesión en React. */
export function setOnSessionExpired(handler: SessionExpiredHandler | null): void {
  onSessionExpired = handler;
}

/**
 * Deduplica refrescos concurrentes: si dos peticiones reciben 401 al mismo
 * tiempo, ambas deben esperar el mismo intento de refresco en lugar de
 * disparar dos llamadas a `/auth/refresh` con el mismo refresh token --el
 * backend rota y revoca toda la familia ante reutilización (D-D en
 * `auth.service.ts`), así que un segundo refresco en paralelo con el mismo
 * token cerraría la sesión igual que un token robado.
 */
let pendingRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshTokenValue) {
    return null;
  }

  if (!pendingRefresh) {
    pendingRefresh = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshTokenValue }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("refresh_failed");
        }
        const data = (await response.json()) as TokenPair;
        setTokens(data);
        return data.accessToken;
      })
      .catch(() => {
        setTokens(null);
        onSessionExpired?.();
        return null;
      })
      .finally(() => {
        pendingRefresh = null;
      });
  }

  return pendingRefresh;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** No adjunta ni espera `Authorization` (login, refresh). */
  skipAuth?: boolean;
  /** Uso interno: evita reintentar refrescos infinitamente. */
  isRetry?: boolean;
}

interface ApiErrorBody {
  code?: string;
  message?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, skipAuth, isRetry, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string> | undefined),
  };
  if (!skipAuth && accessToken) {
    finalHeaders.Authorization = `Bearer ${accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("error_red", 0, NETWORK_ERROR_MESSAGE);
  }

  if (response.status === 401 && !skipAuth && !isRetry) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      return request<T>(path, { ...options, isRetry: true });
    }
    throw new ApiError("sesion_expirada", 401, SESSION_EXPIRED_MESSAGE);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Respuesta sin cuerpo JSON (p. ej. 204 ya cubierto arriba, o error de red parcial).
  }

  if (!response.ok) {
    const apiError = payload as ApiErrorBody | null;
    throw new ApiError(
      apiError?.code ?? "error_desconocido",
      response.status,
      apiError?.message ?? GENERIC_ERROR_MESSAGE,
    );
  }

  return payload as T;
}

export const httpClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),
};

/** Extrae un mensaje accionable en español de cualquier error de una petición. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return GENERIC_ERROR_MESSAGE;
}
