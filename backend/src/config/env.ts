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

/**
 * holding-admin-gateway-auth: `CORS_ORIGIN` accepts a comma-separated list of
 * origins (trimmed, empties dropped). The wildcard `*` is never accepted: it
 * cannot be combined with credentials, so if credentials are ever enabled
 * (`cors({ credentials: true })`) a wildcard origin would be a misconfiguration.
 */
export function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "" && origin !== "*");
}

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
  // Comma-separated list of allowed CORS origins (frontend). Default: where the
  // frontend runs in Docker Compose / local `pnpm dev`. See `parseCorsOrigins`.
  CORS_ORIGIN: z
    .string()
    .min(1, "CORS_ORIGIN es obligatoria")
    .refine(
      (value) => parseCorsOrigins(value).length > 0,
      "CORS_ORIGIN debe listar al menos un origen explícito (sin comodín *)",
    )
    .default("http://localhost:5173"),
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
  // reportes (Bloque E, exportación PDF/XLSX, `lib/azure-blob-storage.ts::
  // uploadReporteArchivo`/`generarUrlTemporalReporte`): contenedor blob PRIVADO
  // (nunca `access: "blob"`) donde `jobs/reportes/reporte-generacion.job.ts`
  // sube el PDF/XLSX generado. Reemplaza al antiguo `REPORTES_STORAGE_DIR`
  // (disco local del contenedor de Azure Container Apps, que no sobrevivía
  // ni era visible entre réplicas al escalar horizontalmente) -- retirado por
  // completo tras confirmar que ningún otro archivo lo referenciaba. Mismo
  // criterio de default que `AZURE_STORAGE_CONTAINER_ISOTIPOS`: no es un
  // secreto, no hace falta exigirlo explícitamente en cada entorno.
  AZURE_STORAGE_CONTAINER_REPORTES: z.string().min(1).default("reportes"),
  // crm-gateway-proxy (ADR #8, design.md): secreto compartido validado por
  // `requireGatewayTrust` contra `x-gateway-secret`. Deliberadamente
  // OPCIONAL (a diferencia de `JWT_SECRET`/`TOKEN_ENCRYPTION_KEY`, que fallan
  // el arranque) -- es el kill switch de rollback (proposal §Rollback 2):
  // dejarla sin setear cierra el camino confiable sin ningún deploy, mientras
  // `requireAuthentication` y el frontend propio de CRM siguen sirviendo
  // `/api/v1/canales-manuales` sin interrupción. Un valor requerido
  // convertiría "deshabilitar el camino confiable" en "CRM no arranca".
  CRM_GATEWAY_SECRET: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
  // holding-admin-gateway-auth / T4 (servicebus-to-rabbitmq-migration): RabbitMQ
  // consumer that auto-provisions Holding + Empresa + admin from the auth
  // `CompanyModuleSubscribed` event (`messaging/crm-company-event-consumer.ts`).
  // Still optional, same criterion Service Bus had: without `RABBITMQ_URL` the
  // consumer/publisher are not created, the CRM logs that messaging is disabled
  // and boots normally. No more `azure`/`local` mode -- RabbitMQ has a single
  // connection mechanism (the URL), so that dichotomy (and its Azure-specific
  // credential/namespace split) no longer applies.
  RABBITMQ_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().regex(/^amqps?:\/\//, "RABBITMQ_URL debe ser una URL amqp:// o amqps://").optional(),
  ),
  // Fanout exchange every domain event is published to (shared across Auth,
  // Billing and CRM); the CRM's own durable queue below is bound to it.
  RABBITMQ_EXCHANGE_NAME: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).default("vimcore-domain-events"),
  ),
  // Same name the old Service Bus subscription used -- the consumer asserts and
  // binds this queue itself on startup.
  RABBITMQ_CRM_QUEUE_NAME: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).default("crm-company-events"),
  ),
  // crm-user-auth-provisioning (C1): outbox publisher loop
  // (`messaging/outbox-publisher-loop.ts`). It only runs when RabbitMQ is
  // configured (same settings as above); these tune its polling and retry cap.
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
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
