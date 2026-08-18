import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
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
