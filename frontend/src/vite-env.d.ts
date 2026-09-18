/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Origen del Api Gateway de la plataforma, sin sufijo (ej.
   * `http://localhost:3001`): el CRM llama `${VITE_GATEWAY_BASE_URL}/crm/<ruta>`
   * con la cookie de sesión. Opcional: `src/api/httpClient.ts` usa
   * `http://localhost:3001` si no se define.
   */
  readonly VITE_GATEWAY_BASE_URL?: string;
  /**
   * Origen del frontend de auth (ej. `http://localhost:5174`): a donde se
   * redirige al usuario sin sesión y tras el cierre de sesión. Opcional:
   * `src/api/httpClient.ts` usa `http://localhost:5174` si no se define.
   */
  readonly VITE_AUTH_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
