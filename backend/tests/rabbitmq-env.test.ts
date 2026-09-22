import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RABBITMQ_VARIABLES = ["RABBITMQ_URL", "RABBITMQ_EXCHANGE_NAME", "RABBITMQ_CRM_QUEUE_NAME"] as const;

function cargar(variables: Record<string, string | undefined>) {
  const entorno = { ...process.env };
  for (const variable of RABBITMQ_VARIABLES) delete entorno[variable];
  for (const [nombre, valor] of Object.entries(variables)) {
    if (valor !== undefined) entorno[nombre] = valor;
  }

  const resultado = spawnSync(
    process.execPath,
    [
      path.join(__dirname, "..", "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(__dirname, "fixtures", "cargar-env-rabbitmq.ts"),
    ],
    { env: entorno, encoding: "utf8" },
  );

  return {
    status: resultado.status,
    stderr: resultado.stderr,
    values: resultado.status === 0 ? JSON.parse(resultado.stdout.trim().split("\n").at(-1) as string) : null,
  };
}

describe("config/env — RabbitMQ (CRM auto-provisioning)", () => {
  it("boots without any RABBITMQ_* variable, with the documented defaults (messaging disabled)", () => {
    const { status, values } = cargar({});

    expect(status).toBe(0);
    expect(values).toEqual({
      url: null,
      exchangeName: "vimcore-domain-events",
      queueName: "crm-company-events",
    });
  });

  it("treats empty variables (Docker Compose) as unset", () => {
    const { status, values } = cargar({
      RABBITMQ_URL: "",
      RABBITMQ_EXCHANGE_NAME: "",
      RABBITMQ_CRM_QUEUE_NAME: "",
    });

    expect(status).toBe(0);
    expect(values).toEqual({ url: null, exchangeName: "vimcore-domain-events", queueName: "crm-company-events" });
  });

  it("reads a configured RabbitMQ URL and custom exchange/queue names", () => {
    const { status, values } = cargar({
      RABBITMQ_URL: "amqp://guest:guest@localhost:5672",
      RABBITMQ_EXCHANGE_NAME: "custom-exchange",
      RABBITMQ_CRM_QUEUE_NAME: "custom-queue",
    });

    expect(status).toBe(0);
    expect(values).toEqual({
      url: "amqp://guest:guest@localhost:5672",
      exchangeName: "custom-exchange",
      queueName: "custom-queue",
    });
  });

  it("rejects a RABBITMQ_URL that is not an amqp:// or amqps:// URL", () => {
    const { status, stderr } = cargar({ RABBITMQ_URL: "https://not-amqp" });

    expect(status).toBe(1);
    expect(stderr).toContain("RABBITMQ_URL");
  });
});
