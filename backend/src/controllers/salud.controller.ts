import type { Request, Response } from "express";
import { getHealthStatus } from "../services/salud.service.js";

export async function getHealth(_req: Request, res: Response): Promise<void> {
  const status = await getHealthStatus();

  if (status.ok) {
    res.status(200).json({ status: "ok", database: status.database });
    return;
  }

  res.status(503).json({ status: "degradado", database: status.database });
}
