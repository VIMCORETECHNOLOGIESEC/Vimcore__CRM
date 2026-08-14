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
