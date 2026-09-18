import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SERVICE_BUS_VARIABLES = [
  "SERVICE_BUS_MODE",
  "SERVICE_BUS_CONNECTION_STRING",
  "SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE",
  "SERVICE_BUS_TOPIC_NAME",
  "SERVICE_BUS_CRM_SUBSCRIPTION_NAME",
] as const;

function cargar(variables: Record<string, string | undefined>) {
  const entorno = { ...process.env };
  for (const variable of SERVICE_BUS_VARIABLES) delete entorno[variable];
  for (const [nombre, valor] of Object.entries(variables)) {
    if (valor !== undefined) entorno[nombre] = valor;
  }

  const resultado = spawnSync(
    process.execPath,
    [
      path.join(__dirname, "..", "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(__dirname, "fixtures", "cargar-env-service-bus.ts"),
    ],
    { env: entorno, encoding: "utf8" },
  );

  return {
    status: resultado.status,
    stderr: resultado.stderr,
    values: resultado.status === 0 ? JSON.parse(resultado.stdout.trim().split("\n").at(-1) as string) : null,
  };
}

describe("config/env — Service Bus (CRM auto-provisioning)", () => {
  it("boots without any SERVICE_BUS_* variable, with the documented defaults", () => {
    const { status, values } = cargar({});

    expect(status).toBe(0);
    expect(values).toEqual({
      mode: "azure",
      connectionString: null,
      namespace: null,
      topic: "vimcore-domain-events",
      subscription: "crm-company-events",
    });
  });

  it("treats empty variables (Docker Compose) as unset", () => {
    const { status, values } = cargar({
      SERVICE_BUS_MODE: "",
      SERVICE_BUS_CONNECTION_STRING: "",
      SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE: "",
      SERVICE_BUS_TOPIC_NAME: "",
      SERVICE_BUS_CRM_SUBSCRIPTION_NAME: "",
    });

    expect(status).toBe(0);
    expect(values).toMatchObject({ mode: "azure", topic: "vimcore-domain-events", subscription: "crm-company-events" });
  });

  it("reads the local emulator configuration", () => {
    const { status, values } = cargar({
      SERVICE_BUS_MODE: "local",
      SERVICE_BUS_CONNECTION_STRING: "Endpoint=sb://emulator;UseDevelopmentEmulator=true;",
      SERVICE_BUS_TOPIC_NAME: "custom-topic",
      SERVICE_BUS_CRM_SUBSCRIPTION_NAME: "custom-sub",
    });

    expect(status).toBe(0);
    expect(values).toEqual({
      mode: "local",
      connectionString: "Endpoint=sb://emulator;UseDevelopmentEmulator=true;",
      namespace: null,
      topic: "custom-topic",
      subscription: "custom-sub",
    });
  });

  it("reads the azure namespace configuration", () => {
    const { status, values } = cargar({
      SERVICE_BUS_MODE: "azure",
      SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE: "vimcore.servicebus.windows.net",
    });

    expect(status).toBe(0);
    expect(values).toMatchObject({ mode: "azure", namespace: "vimcore.servicebus.windows.net" });
  });

  it("rejects an unknown SERVICE_BUS_MODE", () => {
    const { status, stderr } = cargar({ SERVICE_BUS_MODE: "cloud" });

    expect(status).toBe(1);
    expect(stderr).toContain("SERVICE_BUS_MODE");
  });
});
