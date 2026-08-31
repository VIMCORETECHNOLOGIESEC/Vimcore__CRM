import cors from "cors";
import express, { type Express } from "express";
import { pinoHttp } from "pino-http";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middlewares/error-handler.middleware.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

export function createApp(): Express {
  const app = express();

  // `customProps`: marca cada línea de request/response de pino-http con
  // `accessLog: true` para que `logger.ts::loggerOptions` no la suprima --
  // método/URL/status/duración no son datos de negocio, no dependen de
  // contexto tenant para ser seguros de ver en los logs.
  app.use(pinoHttp({ logger, customProps: () => ({ accessLog: true }) }));
  // El frontend (SPA en otro origen) autentica con `Authorization: Bearer`,
  // no con cookies -- no hace falta `credentials: true`. `cors` resuelve el
  // preflight `OPTIONS` automáticamente para el POST JSON de login.
  app.use(cors({ origin: env.CORS_ORIGIN }));
  // `verify` captura el buffer crudo exacto de cada request en `req.rawBody`
  // ANTES de que `express.json()` lo parsee/descarte — el webhook de Meta
  // (`meta-webhook.controller.ts`) lo necesita para verificar
  // `X-Hub-Signature-256` byte a byte (docs/05-bridges.md §3). Aplicarlo acá,
  // globalmente, es más barato y menos frágil que montar un parser aparte
  // solo para esa ruta, y no cambia el comportamiento de ningún otro
  // endpoint: `req.body` sigue siendo el JSON ya parseado de siempre.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use("/api/v1", apiRouter);

  // Middleware central de errores (AGENTS.md §4): siempre el último, después del router.
  app.use(errorHandler);

  return app;
}
