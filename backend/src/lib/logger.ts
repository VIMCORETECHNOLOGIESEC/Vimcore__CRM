import pino, { type DestinationStream, type LoggerOptions } from "pino";
import { env } from "../config/env.js";
import { currentTenantContext } from "./tenant-context.js";

/**
 * Registro estructurado (M1). Redacta credenciales y tokens de cada entrada
 * de log (D8). El serializador `req` por defecto de `pino-http` no emite
 * `req.body`, así que las rutas `req.body.*` son inertes hoy — quedan
 * declaradas para que la redacción exista de inmediato si algún día se añade
 * un serializador de cuerpo. La protección real es no serializar cuerpos.
 */
function loggerOptions(useTransport: boolean): LoggerOptions {
  return {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    mixin() {
      const context = currentTenantContext();
      if (!context) return {};
      return context.empresaId === null
        ? { holdingWide: true }
        : { empresaId: context.empresaId };
    },
    hooks: {
      logMethod(args, method) {
        const context = currentTenantContext();
        const fields = typeof args[0] === "object" && args[0] !== null
          ? args[0] as Record<string, unknown>
          : undefined;
        const explicitScope = fields?.holdingWide === true || typeof fields?.empresaId === "string";
        if (!context && !explicitScope) {
          return method.apply(this, [
            { event: "tenant_output_suppressed" },
            "Salida de log suprimida por contexto tenant ausente",
          ]);
        }
        return method.apply(this, args);
      },
    },
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
    transport: useTransport && env.NODE_ENV === "development"
      ? { target: "pino-pretty" }
      : undefined,
  };
}

export function createTenantLogger(destination?: DestinationStream) {
  return pino(loggerOptions(destination === undefined), destination);
}

export const logger = createTenantLogger();
