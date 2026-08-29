import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LINKEDIN_VARIABLES = [
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "LINKEDIN_API_VERSION",
  "LINKEDIN_REDIRECT_URI",
  "LINKEDIN_API_BASE_URL",
] as const;

const CONFIGURACION_COMPLETA = {
  LINKEDIN_CLIENT_ID: "linkedin-client-id",
  LINKEDIN_CLIENT_SECRET: "linkedin-client-secret",
  LINKEDIN_API_VERSION: "202608",
  LINKEDIN_REDIRECT_URI: "https://crm.test/api/v1/linkedin/oauth/callback",
} as const;

function ejecutarValidacion(
  variables: Record<string, string | undefined>,
): { status: number | null; stderr: string } {
  const fixture = path.join(__dirname, "fixtures", "cargar-env.ts");
  const entorno = { ...process.env };

  for (const variable of LINKEDIN_VARIABLES) {
    delete entorno[variable];
  }
  for (const [nombre, valor] of Object.entries(variables)) {
    if (valor === undefined) {
      delete entorno[nombre];
    } else {
      entorno[nombre] = valor;
    }
  }

  const resultado = spawnSync(
    process.execPath,
    [path.join(__dirname, "..", "node_modules", "tsx", "dist", "cli.mjs"), fixture],
    { env: entorno, encoding: "utf8" },
  );

  return { status: resultado.status, stderr: resultado.stderr };
}

describe("config/env — configuración opcional de LinkedIn", () => {
  it("permite arrancar sin ninguna variable de LinkedIn", () => {
    expect(ejecutarValidacion({}).status).toBe(0);
  });

  it("trata como ausentes las variables vacías entregadas por Docker Compose", () => {
    expect(ejecutarValidacion({
      LINKEDIN_CLIENT_ID: "",
      LINKEDIN_CLIENT_SECRET: "",
      LINKEDIN_API_VERSION: "",
      LINKEDIN_REDIRECT_URI: "",
      LINKEDIN_API_BASE_URL: "",
    }).status).toBe(0);
  });

  it.each(Object.keys(CONFIGURACION_COMPLETA))(
    "rechaza una configuración parcial cuando falta %s",
    (variableFaltante) => {
      const configuracionParcial: Record<string, string | undefined> = {
        ...CONFIGURACION_COMPLETA,
        [variableFaltante]: undefined,
      };

      const resultado = ejecutarValidacion(configuracionParcial);

      expect(resultado.status).toBe(1);
      expect(resultado.stderr).toContain(variableFaltante);
    },
  );

  it("exige el conjunto principal si solo se configura el override de API", () => {
    const resultado = ejecutarValidacion({
      LINKEDIN_API_BASE_URL: "http://linkedin-mock:3001",
    });

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain("LINKEDIN_CLIENT_ID");
  });

  it("acepta el conjunto principal completo con redirect HTTPS", () => {
    expect(ejecutarValidacion(CONFIGURACION_COMPLETA).status).toBe(0);
  });

  it("rechaza un redirect que no sea una URL", () => {
    const resultado = ejecutarValidacion({
      ...CONFIGURACION_COMPLETA,
      LINKEDIN_REDIRECT_URI: "no-es-una-url",
    });

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain("LINKEDIN_REDIRECT_URI");
  });

  it("rechaza redirect HTTP fuera del entorno de test", () => {
    const resultado = ejecutarValidacion({
      ...CONFIGURACION_COMPLETA,
      NODE_ENV: "production",
      LINKEDIN_REDIRECT_URI: "http://localhost:3000/api/v1/linkedin/oauth/callback",
    });

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain("LINKEDIN_REDIRECT_URI");
  });

  it("permite redirect HTTP localhost únicamente en test", () => {
    expect(ejecutarValidacion({
      ...CONFIGURACION_COMPLETA,
      NODE_ENV: "test",
      LINKEDIN_REDIRECT_URI: "http://localhost:3000/api/v1/linkedin/oauth/callback",
    }).status).toBe(0);
  });

  it("rechaza redirect HTTP no-local incluso en test", () => {
    const resultado = ejecutarValidacion({
      ...CONFIGURACION_COMPLETA,
      NODE_ENV: "test",
      LINKEDIN_REDIRECT_URI: "http://linkedin-mock:3001/oauth/callback",
    });

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain("LINKEDIN_REDIRECT_URI");
  });
});
