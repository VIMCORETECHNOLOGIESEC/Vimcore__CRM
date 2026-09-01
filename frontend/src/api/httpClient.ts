/**
 * Cliente HTTP para la API del backend (AGENTS.md §4, docs/07 F1/F2).
 *
 * Cobertura de TDD (AGENTS.md §5): este módulo contiene lógica no trivial
 * (inyección de JWT, cola de refresco ante 401, deduplicación de refrescos
 * concurrentes, mapeo de errores, persistencia de sesión, serialización de
 * query params) -- ver `frontend/tests/httpClient.test.ts`.
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
  "Ocurrió un error inesperado. Intenta nuevamente en unos segundos.";
const NETWORK_ERROR_MESSAGE =
  "No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.";
const SESSION_EXPIRED_MESSAGE = "Tu sesión expiró. Inicia sesión nuevamente.";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_TOKEN_STORAGE_KEY = "crm.refreshToken";

/**
 * `localStorage` puede no estar disponible (modo privado estricto de algunos
 * navegadores, contextos sin `window`) -- estas envolturas degradan a
 * "sin persistencia" en vez de romper el login.
 */
function readPersistedRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistRefreshToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Sin persistencia disponible, la sesión no sobrevive a un recargo pero
    // sigue funcionando en memoria durante la pestaña actual.
  }
}

/**
 * Estado de tokens: `accessToken` solo vive en memoria (nunca se persiste --
 * vida corta, se rehidrata desde `refreshTokenValue` al montar la app). El
 * `refreshTokenValue` sí se persiste en `localStorage` (F2, "Persistencia de
 * sesión y cierre automático al expirar el refresh") y se lee una vez al
 * cargar este módulo para que `restoreSession()` pueda usarlo al arrancar.
 */
let accessToken: string | null = null;
let refreshTokenValue: string | null = readPersistedRefreshToken();

export function setTokens(tokens: TokenPair | null): void {
  accessToken = tokens?.accessToken ?? null;
  refreshTokenValue = tokens?.refreshToken ?? null;
  persistRefreshToken(refreshTokenValue);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshTokenValue;
}

type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

function expireSession(): void {
  setTokens(null);
  onSessionExpired?.();
}

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
        expireSession();
        return null;
      })
      .finally(() => {
        pendingRefresh = null;
      });
  }

  return pendingRefresh;
}

/**
 * Rehidrata la sesión al montar la app a partir del refresh token
 * persistido (F2). Reutiliza `refreshAccessToken()` -- la misma cola que
 * deduplica refrescos concurrentes ante un 401 -- así un refresco disparado
 * al arrancar nunca compite con uno disparado por una petición temprana.
 * Si el refresh token persistido ya expiró o fue revocado, `AuthProvider`
 * recibe el mismo `onSessionExpired` que usa el interceptor 401 y cierra la
 * sesión sola (sin sesión previa real que cerrar, es un no-op visible).
 */
export async function restoreSession(): Promise<boolean> {
  if (!refreshTokenValue) {
    return false;
  }
  const newAccessToken = await refreshAccessToken();
  return newAccessToken !== null;
}

/**
 * Valores admitidos en `RequestOptions.params` -- `undefined` se omite (no
 * manda `campo=undefined`), el resto se serializa con `String()` (así un
 * booleano como `activo: true` viaja como `"true"`, el formato exacto que
 * espera `GET /usuarios` -- ver `usuarios.api.ts::UsuariosQueryParams`).
 */
export type QueryParamValue = string | number | boolean | undefined;

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Query params de un GET, serializados a `?clave=valor` (F7, listado con filtro y paginación real). */
  params?: Record<string, QueryParamValue>;
  /** No adjunta ni espera `Authorization` (login, refresh). */
  skipAuth?: boolean;
}

export interface AuthenticatedFetchOptions extends RequestInit {
  params?: Record<string, QueryParamValue>;
}

interface ApiErrorBody {
  code?: string;
  message?: string;
}

function buildQueryString(params?: Record<string, QueryParamValue>): string {
  if (!params) return "";
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

async function fetchAuthenticatedResponse(
  path: string,
  options: AuthenticatedFetchOptions,
  isRetry: boolean,
): Promise<Response> {
  const { headers, params, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    ...(headers as Record<string, string> | undefined),
  };
  if (accessToken) {
    finalHeaders.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}${buildQueryString(params)}`, {
    ...rest,
    headers: finalHeaders,
  });

  if (response.status !== 401) {
    return response;
  }

  if (isRetry) {
    expireSession();
    return response;
  }

  const hadLocalSession = accessToken !== null || refreshTokenValue !== null;
  const newAccessToken = await refreshAccessToken();
  if (newAccessToken) {
    return fetchAuthenticatedResponse(path, options, true);
  }
  if (hadLocalSession && (accessToken !== null || refreshTokenValue !== null)) {
    expireSession();
  }
  return response;
}

/**
 * Ejecuta una petición autenticada y devuelve la `Response` sin consumirla.
 * Se usa tanto por el cliente JSON como por streams SSE: el bearer viaja solo
 * en headers, un 401 admite como máximo un refresco y un segundo 401 expira la
 * sesión antes de devolver la respuesta terminal al consumidor.
 */
export function authenticatedFetch(
  path: string,
  options: AuthenticatedFetchOptions = {},
): Promise<Response> {
  return fetchAuthenticatedResponse(path, options, false);
}

/**
 * Extraído de `request()` para compartirlo con `requestFormData()` (subida de
 * archivos, `postFormData`): ambos hacen `fetch`/`authenticatedFetch` con
 * cuerpos distintos (JSON serializado vs. `FormData`), pero el mapeo de
 * `Response` -> `T`/`ApiError` es idéntico. `skipAuth` solo importa para el
 * caso 401: en un endpoint sin auth (login) un 401 es un error de dominio
 * normal con su propio `code`/`message` del backend, no una sesión expirada.
 */
async function parseResponse<T>(response: Response, skipAuth: boolean): Promise<T> {
  if (response.status === 401 && !skipAuth) {
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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, skipAuth, headers, params, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string> | undefined),
  };
  if (!skipAuth && accessToken) {
    finalHeaders.Authorization = `Bearer ${accessToken}`;
  }

  let response: Response;
  try {
    const fetchOptions = {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      params,
    };
    response = skipAuth
      ? await fetch(`${API_BASE_URL}${path}${buildQueryString(params)}`, fetchOptions)
      : await authenticatedFetch(path, fetchOptions);
  } catch {
    throw new ApiError("error_red", 0, NETWORK_ERROR_MESSAGE);
  }

  return parseResponse<T>(response, Boolean(skipAuth));
}

/**
 * Subida de archivo (`multipart/form-data`) autenticada -- a propósito NO pasa
 * por `request()`: ese helper siempre serializa `body` a JSON y fuerza
 * `Content-Type: application/json`, lo que rompería un `FormData` (el
 * navegador necesita fijar `Content-Type: multipart/form-data; boundary=...`
 * él mismo a partir del `FormData`, y solo lo hace si el header queda
 * ausente). Por eso acá no se pasa ningún `headers` a `authenticatedFetch`
 * más que el `Authorization` que ya inyecta internamente -- nunca se setea
 * `Content-Type` a mano.
 */
async function requestFormData<T>(path: string, formData: FormData): Promise<T> {
  let response: Response;
  try {
    response = await authenticatedFetch(path, { method: "POST", body: formData });
  } catch {
    throw new ApiError("error_red", 0, NETWORK_ERROR_MESSAGE);
  }

  return parseResponse<T>(response, false);
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
  /** `POST` con `FormData` (subida de archivos) -- ver `requestFormData()`. */
  postFormData: <T>(path: string, formData: FormData) => requestFormData<T>(path, formData),
};

/** Extrae un mensaje accionable en español de cualquier error de una petición. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return GENERIC_ERROR_MESSAGE;
}
