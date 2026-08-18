import type { Request, Response } from "express";
import { assertAuthenticated } from "../lib/assert-authenticated.js";
import { openEventStream } from "../services/eventos.service.js";

export function getEvents(req: Request, res: Response): void {
  const user = assertAuthenticated(req);
  openEventStream(req, res, user.id);
}
