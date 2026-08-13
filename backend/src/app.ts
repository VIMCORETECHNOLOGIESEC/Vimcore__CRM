import express, { type Express } from "express";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middlewares/error-handler.middleware.js";

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use("/api/v1", apiRouter);

  // Middleware central de errores (AGENTS.md §4): siempre el último, después del router.
  app.use(errorHandler);

  return app;
}
