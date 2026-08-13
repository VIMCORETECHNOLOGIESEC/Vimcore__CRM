import { checkDatabaseConnection } from "../repositories/salud.repository.js";

export interface HealthStatus {
  ok: boolean;
  database: "ok" | "error";
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const databaseOk = await checkDatabaseConnection();

  return {
    ok: databaseOk,
    database: databaseOk ? "ok" : "error",
  };
}
