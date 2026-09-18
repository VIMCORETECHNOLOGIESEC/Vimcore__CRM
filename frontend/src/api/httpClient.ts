/**
 * Cliente HTTP del CRM hacia el Api Gateway de la plataforma (AGENTS.md §4).
 *
 * Cobertura de TDD (AGENTS.md §5): este módulo contiene lógica no trivial
 * (redirección al frontend de auth ante 401 con guarda anti-bucle, mapeo de
 * los dos formatos de error, serialización de query params) -- ver
 * `frontend/tests/httpClient.test.ts`.
 *
 * Contrato (gateway `/crm/*` -> CRM `/api/v1/*`):
 * - Sesión: cookie HttpOnly `gw_session` del gateway, enviada con
 *   `credentials: "include"`. El CRM no maneja tokens: ni `Authorization`, ni
 *   refresh, ni nada en `localStorage`.
 * - URL: `${VITE_GATEWAY_BASE_URL}/crm<path>` (antes `${VITE_API_BASE_URL}<path>`).
 * - Éxito: el gateway reenvía la respuesta del CRM tal cual (sin sobre).
 * - Errores: del CRM `{ code, message }` (mensaje ya accionable en español);
 *   generados por el gateway `{ success: false, error: { code, message } }`.
 *   Se normalizan ambos a `ApiError`.
 * - 401 (`AUTH_REQUIRED` o cualquiera): no hay sesión de plataforma -> se
 *   redirige el navegador al frontend de auth (`VITE_AUTH_APP_URL`).
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

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

const GATEWAY_BASE_URL = stripTrailingSlash(
  import.meta.env.VITE_GATEWAY_BASE_URL ?? "http://localhost:3001",
);
const AUTH_APP_URL = stripTrailingSlash(
  import.meta.env.VITE_AUTH_APP_URL ?? "http://localhost:5174",
);
const API_BASE_URL = `${GATEWAY_BASE_URL}/crm`;
/** El frontend de auth no admite URL de retorno: se redirige a su login. */
const AUTH_LOGIN_URL = `${AUTH_APP_URL}/auth/login`;

/** Origen del gateway (para llamadas fuera de `/crm`, p. ej. `POST /auth/logout`). */
export function getGatewayBaseUrl(): string {
  return GATEWAY_BASE_URL;
}

export function getAuthLoginUrl(): string {
  return AUTH_LOGIN_URL;
}

/**
 * Guarda anti-bucle auth <-> CRM: (1) `redirecting` evita disparar varias
 * navegaciones en la misma carga (varias peticiones con 401 a la vez);
 * (2) si ya se redirigió hace menos de `AUTH_REDIRECT_THROTTLE_MS` (un
 * rebote auth -> CRM -> auth), no se redirige otra vez y el llamador debe
 * mostrar una pantalla con un enlace manual. `sessionStorage` solo guarda un
 * timestamp, nunca datos de sesión.
 */
const AUTH_REDIRECT_STORAGE_KEY = "crm.authRedirectAt";
const AUTH_REDIRECT_THROTTLE_MS = 10_000;
let redirecting = false;

/** `true` si el navegador ya va (o acaba de ir) al frontend de auth; `false` si se frenó por posible bucle. */
export function redirectToAuth(): boolean {
  if (redirecting) {
    return true;
  }
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(AUTH_REDIRECT_STORAGE_KEY));
    if (last && now - last < AUTH_REDIRECT_THROTTLE_MS) {
      return false;
    }
    sessionStorage.setItem(AUTH_REDIRECT_STORAGE_KEY, String(now));
  } catch {
    // Sin `sessionStorage` la guarda (2) no aplica; la (1) sigue vigente.
  }
  redirecting = true;
  window.location.assign(AUTH_LOGIN_URL);
  return true;
}

/** Solo para tests: reinicia la guarda anti-bucle entre casos. */
export function resetAuthRedirectGuard(): void {
  redirecting = false;
  try {
    sessionStorage.removeItem(AUTH_REDIRECT_STORAGE_KEY);
  } catch {
    // Sin `sessionStorage` no hay nada que reiniciar.
  }
}

type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

/** Registrado por `AuthProvider` para limpiar el estado de sesión en React ante un 401. */
export function setOnSessionExpired(handler: SessionExpiredHandler | null): void {
  onSessionExpired = handler;
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
  /**
   * Endpoint que no debe tratar un 401 como "sesión de plataforma perdida"
   * (marca pública, callbacks OAuth): el 401 es un error normal, sin
   * redirección al frontend de auth.
   */
  skipAuth?: boolean;
}

export interface AuthenticatedFetchOptions extends RequestInit {
  params?: Record<string, QueryParamValue>;
}

/** Errores del CRM (`{ code, message }`) o del gateway (`{ success: false, error: { code, message } }`). */
interface ApiErrorBody {
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
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

async function fetchGateway(
  path: string,
  options: AuthenticatedFetchOptions,
  redirectOn401: boolean,
): Promise<Response> {
  const { params, ...rest } = options;

  const response = await fetch(`${API_BASE_URL}${path}${buildQueryString(params)}`, {
    ...rest,
    credentials: "include",
  });

  if (response.status === 401 && redirectOn401) {
    onSessionExpired?.();
    redirectToAuth();
  }
  return response;
}

/**
 * Ejecuta una petición con la cookie de sesión del gateway y devuelve la
 * `Response` sin consumirla. Se usa tanto por el cliente JSON como por streams
 * SSE. Un 401 limpia el estado de sesión local y redirige al frontend de auth
 * antes de devolver la respuesta terminal al consumidor.
 */
export function authenticatedFetch(
  path: string,
  options: AuthenticatedFetchOptions = {},
): Promise<Response> {
  return fetchGateway(path, options, true);
}

/**
 * Extraído de `request()` para compartirlo con `requestFormData()` (subida de
 * archivos, `postFormData`): ambos hacen `fetch` con cuerpos distintos (JSON
 * serializado vs. `FormData`), pero el mapeo de `Response` -> `T`/`ApiError`
 * es idéntico. `skipAuth` solo importa para el caso 401: en un endpoint
 * público un 401 es un error de dominio normal con su propio `code`/`message`,
 * no una sesión perdida.
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
    const body = payload as ApiErrorBody | null;
    const apiError = body?.error ?? body;
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

  let response: Response;
  try {
    response = await fetchGateway(
      path,
      {
        ...rest,
        headers: finalHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        params,
      },
      !skipAuth,
    );
  } catch {
    throw new ApiError("error_red", 0, NETWORK_ERROR_MESSAGE);
  }

  return parseResponse<T>(response, Boolean(skipAuth));
}

/**
 * Subida de archivo (`multipart/form-data`) -- a propósito NO pasa por
 * `request()`: ese helper siempre serializa `body` a JSON y fuerza
 * `Content-Type: application/json`, lo que rompería un `FormData` (el
 * navegador necesita fijar `Content-Type: multipart/form-data; boundary=...`
 * él mismo a partir del `FormData`, y solo lo hace si el header queda
 * ausente). Por eso acá nunca se setea `Content-Type` a mano.
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
