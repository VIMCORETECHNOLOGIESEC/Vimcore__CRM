import type { Request, Response } from "express";
import { assertAuthenticated } from "../lib/assert-authenticated.js";
import { openEventStream } from "../services/eventos.service.js";

export function getEvents(req: Request, res: Response): void {
  const user = assertAuthenticated(req);
  const scope = user.sessionScope === "holding"
    ? { sessionScope: "holding" as const, empresaId: null }
    : { sessionScope: "company" as const, empresaId: user.empresaId as string };
  openEventStream(req, res, user.id, scope);
}
