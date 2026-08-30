import { describe, expect, it } from "vitest";
import { createTenantLogger } from "../src/lib/logger.js";
import { runWithTenantContext } from "../src/lib/prisma.js";

function captureLogs() {
  const lines: string[] = [];
  const logger = createTenantLogger({ write: (line: string) => lines.push(line) });
  return { logger, lines };
}

describe("tenant logger", () => {
  it("añade empresa o holding explícito y suprime payloads cuando falta contexto", () => {
    const { logger, lines } = captureLogs();

    runWithTenantContext({ empresaId: "empresa-a" }, () => logger.info({ operation: "company" }, "company"));
    runWithTenantContext({ empresaId: null }, () => logger.info({ operation: "holding" }, "holding"));
    logger.info({ foreignPayload: "no-debe-salir" }, "ambiguous");

    const records = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records[0]).toMatchObject({ empresaId: "empresa-a", operation: "company" });
    expect(records[1]).toMatchObject({ holdingWide: true, operation: "holding" });
    expect(records[2]).toMatchObject({ event: "tenant_output_suppressed" });
    expect(records[2]).not.toHaveProperty("foreignPayload");
    expect(records[2]?.msg).not.toBe("ambiguous");
  });
});
