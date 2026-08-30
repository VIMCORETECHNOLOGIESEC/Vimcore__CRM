import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  BYPASS_JOB_ALLOWLIST,
  runAsBypassJob,
} from "../src/lib/prisma.js";
import { prisma } from "../src/lib/prisma.js";

const BOUNDS = { maxWait: 5_000, timeout: 10_000 };
const SRC_DIR = path.join(import.meta.dirname, "..", "src");

/**
 * Bloque C (Etapa 3, task 6.4): audita ESTÁTICAMENTE todo el árbol `src/` en
 * busca de `runAsBypassJob("<jobId>", ...)` — cualquier `jobId` real que no
 * esté en `BYPASS_JOB_ALLOWLIST` (`lib/prisma.ts`) haría que `runAsBypassJob`
 * lance `bypass_no_autorizado` en runtime; este test lo detecta en build time
 * en vez de esperar a que un job nuevo falle recién en producción, y también
 * detecta si un job se retira del código pero queda huérfano en la allowlist.
 */
function listarArchivosTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listarArchivosTs(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

function jobIdsInvocadosEnFuente(): Set<string> {
  const patron = /runAsBypassJob\(\s*["'`]([a-zA-Z0-9-]+)["'`]/g;
  const encontrados = new Set<string>();
  for (const archivo of listarArchivosTs(SRC_DIR)) {
    const contenido = readFileSync(archivo, "utf-8");
    for (const match of contenido.matchAll(patron)) {
      encontrados.add(match[1] as string);
    }
  }
  return encontrados;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("bypass job discovery", () => {
  it("expone una allowlist auditable con regla de partición para cada caller", () => {
    expect(BYPASS_JOB_ALLOWLIST).toEqual({
      "sla-overdue": expect.objectContaining({ owner: "sla-atrasado", partitionBy: "empresaId" }),
      "appointment-reminder": expect.objectContaining({ owner: "citas-recordatorio", partitionBy: "empresaId" }),
      "silent-bridge": expect.objectContaining({ owner: "bridge-mudo", partitionBy: "empresaId" }),
      "token-verification": expect.objectContaining({ owner: "verificacion-token", partitionBy: "empresaId" }),
      "token-expiry-alert": expect.objectContaining({ owner: "verificacion-token", partitionBy: "empresaId" }),
      "meta-ads-sync": expect.objectContaining({ owner: "meta-ads-sync", partitionBy: "empresaId" }),
      "post-commit-assignment": expect.objectContaining({ owner: "assignAfterCommit", partitionBy: "empresaId" }),
      "assignment-degradation": expect.objectContaining({ owner: "assignAfterCommit", partitionBy: "empresaId" }),
    });
  });

  it("permite descubrimiento de solo lectura a un caller allowlisted", async () => {
    const rows = await runAsBypassJob(
      "sla-overdue",
      (tx) => tx.$queryRaw<Array<{ value: bigint }>>`SELECT 1::bigint AS value`,
      BOUNDS,
    );
    expect(rows).toEqual([{ value: 1n }]);
  });

  it("rechaza mutaciones aunque el caller esté allowlisted", async () => {
    await expect(
      runAsBypassJob(
        "sla-overdue",
        (tx) => tx.$executeRawUnsafe('UPDATE "leads" SET "version" = "version" WHERE false'),
        BOUNDS,
      ),
    ).rejects.toThrow(/read-only transaction|solo lectura/i);
  });

  it("rechaza identidades que no están en la allowlist", async () => {
    await expect(
      runAsBypassJob(
        "http-request" as never,
        (tx) => tx.$queryRaw`SELECT 1`,
        BOUNDS,
      ),
    ).rejects.toMatchObject({ code: "bypass_no_autorizado" });
  });

  it("todo jobId invocado realmente desde src/ existe en BYPASS_JOB_ALLOWLIST (task 6.4)", () => {
    const invocados = jobIdsInvocadosEnFuente();
    expect(invocados.size).toBeGreaterThan(0);
    for (const jobId of invocados) {
      expect(Object.keys(BYPASS_JOB_ALLOWLIST)).toContain(jobId);
    }
  });

  it("BYPASS_JOB_ALLOWLIST no tiene entradas huérfanas sin caller real en src/ (task 6.4)", () => {
    const invocados = jobIdsInvocadosEnFuente();
    for (const jobId of Object.keys(BYPASS_JOB_ALLOWLIST)) {
      expect(invocados).toContain(jobId);
    }
  });
});
