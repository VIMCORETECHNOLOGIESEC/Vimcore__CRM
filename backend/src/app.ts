import cors from "cors";
import express, { type Express } from "express";
import { pinoHttp } from "pino-http";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middlewares/error-handler.middleware.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

export function createApp(): Express {
  const app = express();

  app.use(pinoHttp({ logger }));
  // El frontend (SPA en otro origen) autentica con `Authorization: Bearer`,
  // no con cookies -- no hace falta `credentials: true`. `cors` resuelve el
  // preflight `OPTIONS` automáticamente para el POST JSON de login.
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());
  app.use("/api/v1", apiRouter);

  // Middleware central de errores (AGENTS.md §4): siempre el último, después del router.
  app.use(errorHandler);

  return app;
}
