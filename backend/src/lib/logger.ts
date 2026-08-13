import pino from "pino";
import { env } from "../config/env.js";

/**
 * Registro estructurado (M1). Redacta credenciales y tokens de cada entrada
 * de log (D8). El serializador `req` por defecto de `pino-http` no emite
 * `req.body`, así que las rutas `req.body.*` son inertes hoy — quedan
 * declaradas para que la redacción exista de inmediato si algún día se añade
 * un serializador de cuerpo. La protección real es no serializar cuerpos.
 */
export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "req.body.password",
      "req.body.contrasena",
      "req.body.refreshToken",
      "password",
      "contrasena",
      "passwordHash",
      "accessToken",
      "refreshToken",
      "token",
      "*.password",
      "*.contrasena",
      "*.passwordHash",
      "*.accessToken",
      "*.refreshToken",
    ],
    censor: "[REDACTADO]",
  },
  transport:
    env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
});
