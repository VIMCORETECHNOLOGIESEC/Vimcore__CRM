/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * URL base de la API del backend, incluido el prefijo de versión
   * (ej. `http://localhost:3000/api/v1`). Opcional: `src/api/httpClient.ts`
   * usa un valor por defecto apto para `docker compose up` si no se define.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
