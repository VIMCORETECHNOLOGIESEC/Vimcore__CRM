import { z } from "zod";

const optionalEnvString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional(),
);

const optionalEnvUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().url().optional(),
);

const LINKEDIN_CORE_VARIABLES = [
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "LINKEDIN_API_VERSION",
  "LINKEDIN_REDIRECT_URI",
] as const;

const LINKEDIN_VARIABLES = [
  ...LINKEDIN_CORE_VARIABLES,
  "LINKEDIN_API_BASE_URL",
] as const;

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  // D8 (Bloque C, Etapa 3): conexión de runtime de la aplicación, distinta
  // de `DATABASE_URL` (que sigue siendo la credencial superusuario usada
  // solo por `prisma migrate deploy`/`seed.ts`). Apunta al rol no-superusuario
  // `crm_app` — imprescindible para que RLS/FORCE ROW LEVEL SECURITY tenga
  // efecto real (Postgres ignora RLS para superusuarios sin excepción).
  DATABASE_URL_APP: z.string().min(1, "DATABASE_URL_APP es obligatoria"),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // D-C: secreto único HS256 compartido entre access y refresh (jose). El
  // proceso no arranca sin él — mitiga la exposición de un secreto débil.
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  // D1: TTLs en segundos (no "1h"/"30d") — una sola fuente de verdad para
  // `setExpirationTime` y el cálculo de `expiraEn` en `refresh_tokens`.
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
  // Origen permitido para CORS (frontend). Default: donde corre el frontend
  // en Docker Compose / `pnpm dev` local.
  CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN es obligatoria").default("http://localhost:5173"),
  // M4 (decisión 2026-08-18, docs/03-modelo-datos.md §cuentas_publicitarias):
  // clave maestra AES-256-GCM (`lib/cifrado-token.ts`) para cifrar tokens de
  // redes sociales en reposo (`cuentas_publicitarias.token_cifrado`). 64
  // caracteres hex = 32 bytes exactos, requeridos por AES-256. El proceso no
  // arranca sin ella — mismo patrón que `JWT_SECRET`. Generar con
  // `openssl rand -hex 32`.
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "TOKEN_ENCRYPTION_KEY debe ser hex de 64 caracteres (32 bytes)"),
  // Adaptador Meta (docs/05-bridges.md §3): valor arbitrario elegido por el
  // administrador al configurar la suscripción del webhook en el dashboard
  // de Meta App — se compara contra `hub.verify_token` en el handshake
  // (`GET`, una sola vez por app, no por Página). El proceso no arranca sin
  // él — mismo patrón fail-fast que `TOKEN_ENCRYPTION_KEY`/`JWT_SECRET`.
  META_WEBHOOK_VERIFY_TOKEN: z
    .string()
    .min(1, "META_WEBHOOK_VERIFY_TOKEN es obligatoria"),
  // App Secret de la Meta App (dashboard de Meta, "Configuración básica").
  // HMAC-SHA256 sobre el cuerpo crudo de cada notificación de webhook
  // (`X-Hub-Signature-256`) — un solo secreto por app, no por Página (a
  // diferencia del Page Access Token, que sí es por Página y vive cifrado en
  // `CuentaPublicitaria.tokenCifrado`). Mismo patrón fail-fast.
  META_APP_SECRET: z.string().min(1, "META_APP_SECRET es obligatoria"),
  // ID numérico de la Meta App (dashboard, "Configuración básica"). Junto con
  // `META_APP_SECRET` compone el App Access Token (`<APP_ID>|<APP_SECRET>`)
  // que Graph API exige como `access_token` de `/debug_token` para poder
  // inspeccionar el Page Access Token de un tercero (docs/05-bridges.md §3,
  // §7) — un solo App ID por app, no por Página. Mismo patrón fail-fast.
  META_APP_ID: z.string().min(1, "META_APP_ID es obligatoria"),
  // QA local (test/integration): override exclusivo para redirigir Graph API
  // a un mock dentro de docker-compose (`meta-mock`, backend/scripts/) sin
  // credenciales reales. Opcional — nunca se setea fuera de ese compose, así
  // que en el resto de los entornos `meta-webhook.service.ts` usa la URL real
  // de Meta sin cambio de comportamiento.
  META_GRAPH_API_BASE_URL: z.string().min(1).optional(),
  // LinkedIn Lead Sync es opcional en runtime. Docker Compose puede entregar
  // variables no configuradas como cadenas vacías; se normalizan a undefined
  // para conservar el arranque sin integración. Si aparece cualquier variable
  // LinkedIn, el conjunto principal se valida completo más abajo.
  LINKEDIN_CLIENT_ID: optionalEnvString,
  LINKEDIN_CLIENT_SECRET: optionalEnvString,
  LINKEDIN_API_VERSION: optionalEnvString,
  LINKEDIN_REDIRECT_URI: optionalEnvUrl,
  // Override exclusivo para tests/QA; producción usa el endpoint oficial.
  LINKEDIN_API_BASE_URL: optionalEnvUrl,
  // whatsappMessages: OAuth "Facebook Login for Business" reusa `META_APP_ID`/
  // `META_APP_SECRET` (misma Meta App que ya sirve los webhooks de Ads
  // leadgen — WhatsApp Business Platform vive en la misma cuenta de
  // desarrollador) — solo falta la URL de retorno registrada en el dashboard
  // de la Meta App para este flujo. Opcional, mismo criterio que
  // `LINKEDIN_REDIRECT_URI`: si no está configurada, `GET /whatsapp/conectar`
  // responde 503 en vez de impedir el arranque del proceso — la integración
  // de WhatsApp es opcional en runtime, igual que LinkedIn Lead Sync.
  WHATSAPP_OAUTH_REDIRECT_URI: optionalEnvUrl,
  // metaAdsConexion (Bloque E, docs/blocks/e-dashboards.md "Sincronización de
  // campañas Meta"): OAuth de la Marketing/Insights API de una cuenta de
  // anuncios (`act_<id>`) -- también reusa `META_APP_ID`/`META_APP_SECRET`
  // (misma Meta App), solo falta su propia URL de retorno registrada en el
  // dashboard, distinta de `WHATSAPP_OAUTH_REDIRECT_URI` (mismo criterio que
  // esa: opcional, `GET /meta-ads/conectar` responde 503 en vez de impedir el
  // arranque del proceso si no está configurada).
  META_ADS_OAUTH_REDIRECT_URI: optionalEnvUrl,
  // reportes (Bloque E, exportación PDF/XLSX): directorio local donde
  // `jobs/reportes/reporte-generacion.job.ts` escribe el PDF/XLSX generado
  // antes de que `GET /reportes/jobs/:id/descargar` lo sirva. Sin backend de
  // almacenamiento externo (S3 u otro) en este batch -- fuera del alcance
  // documentado; anotado en el reporte del batch como limitación conocida en
  // un despliegue multi-réplica.
  REPORTES_STORAGE_DIR: z.string().min(1).default("storage/reportes"),
  // logo upload (isotipo de empresa, `lib/azure-blob-storage.ts`): cadena de
  // conexión de la Storage Account de Azure Blob Storage donde se persisten
  // los isotipos subidos. Opcional en runtime, mismo criterio que
  // `WHATSAPP_OAUTH_REDIRECT_URI`/`META_ADS_OAUTH_REDIRECT_URI`: si falta, los
  // endpoints `POST .../logo` responden 503 en vez de impedir el arranque del
  // proceso completo -- la subida de isotipo es una integración opcional, no
  // core del producto.
  AZURE_STORAGE_CONNECTION_STRING: optionalEnvString,
  // Nombre del contenedor blob donde se guardan los isotipos. Con default
  // razonable -- a diferencia de la cadena de conexión, este valor no es un
  // secreto y no hay motivo para exigirlo explícitamente en cada entorno.
  AZURE_STORAGE_CONTAINER_ISOTIPOS: z.string().min(1).default("isotipos"),
  // SOLO Azurite local (docs/contrato-azurite-isotipo.md): la connection
  // string usa el hostname de red interna de Docker Compose
  // (`azurite:10000`), necesario para que el backend LLEGUE al emulador --
  // pero ese hostname no resuelve desde el navegador del host, que necesita
  // `localhost:10000` para poder mostrar el isotipo subido (`<img src>`).
  // Cuando esta variable está seteada, `uploadImage` reescribe solo el
  // origin de la URL devuelta (protocolo+host+puerto), sin tocar el path.
  // DEBE quedar SIN SETEAR en producción real contra Azure: la Storage
  // Account real ya expone una URL pública única, igual de resoluble desde
  // el backend y desde el navegador -- no hay split que resolver ahí.
  AZURE_STORAGE_PUBLIC_BASE_URL: optionalEnvString,
}).superRefine((values, context) => {
  const linkedinConfigured = LINKEDIN_VARIABLES.some(
    (variable) => values[variable] !== undefined,
  );

  if (values.META_ADS_OAUTH_REDIRECT_URI !== undefined) {
    const metaAdsRedirectUri = new URL(values.META_ADS_OAUTH_REDIRECT_URI);
    const isMetaAdsHttps = metaAdsRedirectUri.protocol === "https:";
    const isMetaAdsTestLocalhostHttp = values.NODE_ENV === "test"
      && metaAdsRedirectUri.protocol === "http:"
      && metaAdsRedirectUri.hostname === "localhost";
    if (!isMetaAdsHttps && !isMetaAdsTestLocalhostHttp) {
      context.addIssue({
        code: "custom",
        path: ["META_ADS_OAUTH_REDIRECT_URI"],
        message: "META_ADS_OAUTH_REDIRECT_URI debe usar HTTPS, salvo HTTP localhost en NODE_ENV=test",
      });
    }
  }

  if (!linkedinConfigured) return;

  for (const variable of LINKEDIN_CORE_VARIABLES) {
    if (values[variable] === undefined) {
      context.addIssue({
        code: "custom",
        path: [variable],
        message: `${variable} es obligatoria cuando LinkedIn está configurado`,
      });
    }
  }

  if (values.LINKEDIN_REDIRECT_URI === undefined) return;

  let redirectUri: URL;
  try {
    redirectUri = new URL(values.LINKEDIN_REDIRECT_URI);
  } catch {
    // El schema de URL ya informa la ruta precisa de este error.
    return;
  }
  const isHttps = redirectUri.protocol === "https:";
  const isTestLocalhostHttp = values.NODE_ENV === "test"
    && redirectUri.protocol === "http:"
    && redirectUri.hostname === "localhost";

  if (!isHttps && !isTestLocalhostHttp) {
    context.addIssue({
      code: "custom",
      path: ["LINKEDIN_REDIRECT_URI"],
      message: "LINKEDIN_REDIRECT_URI debe usar HTTPS, salvo HTTP localhost en NODE_ENV=test",
    });
  }
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    // eslint-disable-next-line no-console
    console.error(`Configuración de entorno inválida — ${messages}`);
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
