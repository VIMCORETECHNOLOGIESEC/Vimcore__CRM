import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MARCA_CONOCIDA_STORAGE_KEY,
  getMarcaConocida,
  persistMarcaConocida,
} from "@/lib/marca-cache";
import type { AuthenticatedUser } from "@/tipos/usuario";

/**
 * Fix "boot desincronizado" (F5 con sesión activa): cache optimista de la
 * última marca conocida en `localStorage`, para que `AppBoot.tsx` pueda
 * pintar el splash inicial con el branding real de la empresa del usuario en
 * vez del branding público del holding, mientras la query real resuelve.
 * Dato stale por diseño -- ver comentario en `marca-cache.ts`.
 */

const usuarioCompanyConColorPropio: AuthenticatedUser = {
  id: "u1",
  nombre: "Beto",
  correo: "beto@crm.test",
  rol: "ASESOR",
  sessionScope: "company",
  empresaId: "empresa-a",
  empresaNombre: "Empresa A",
  empresaColorPrimario: "#7c2d12",
  empresaColorSecundario: "#f97316",
  empresaLogoUrl: null,
};

const usuarioCompanySinColorPropio: AuthenticatedUser = {
  id: "u2",
  nombre: "Ana",
  correo: "ana@crm.test",
  rol: "ASESOR",
  sessionScope: "company",
  empresaId: "empresa-b",
  empresaNombre: "Empresa B",
  empresaColorPrimario: null,
  empresaColorSecundario: null,
  empresaLogoUrl: null,
};

const usuarioHolding: AuthenticatedUser = {
  id: "u3",
  nombre: "Carla",
  correo: "carla@crm.test",
  rol: "ADMINISTRADOR",
  sessionScope: "holding",
  empresaId: null,
  empresaNombre: null,
  empresaColorPrimario: null,
  empresaColorSecundario: null,
  empresaLogoUrl: null,
};

beforeEach(() => {
  localStorage.removeItem(MARCA_CONOCIDA_STORAGE_KEY);
});

afterEach(() => {
  localStorage.removeItem(MARCA_CONOCIDA_STORAGE_KEY);
});

describe("marca-cache — persistMarcaConocida", () => {
  it("persiste empresaId/nombre/colores de una empresa con color propio", () => {
    persistMarcaConocida(usuarioCompanyConColorPropio);

    expect(getMarcaConocida()).toEqual({
      empresaId: "empresa-a",
      nombre: "Empresa A",
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
    });
  });

  it("con una empresa sin color propio, cae al default de fábrica para los colores", () => {
    persistMarcaConocida(usuarioCompanySinColorPropio);

    expect(getMarcaConocida()).toEqual({
      empresaId: "empresa-b",
      nombre: "Empresa B",
      colorPrimario: "#1e2a5e",
      colorSecundario: "#2563eb",
    });
  });

  it("con una sesión holding, persiste el nombre/colores de fábrica y empresaId null", () => {
    persistMarcaConocida(usuarioHolding);

    expect(getMarcaConocida()).toEqual({
      empresaId: null,
      nombre: "CRM Embudo de Leads",
      colorPrimario: "#1e2a5e",
      colorSecundario: "#2563eb",
    });
  });

  it("sobrescribe la marca cacheada anteriormente con la más reciente", () => {
    persistMarcaConocida(usuarioCompanyConColorPropio);
    persistMarcaConocida(usuarioHolding);

    expect(getMarcaConocida()?.nombre).toBe("CRM Embudo de Leads");
  });
});

describe("marca-cache — getMarcaConocida", () => {
  it("sin nada cacheado todavía, devuelve null", () => {
    expect(getMarcaConocida()).toBeNull();
  });

  it("con un valor corrupto en localStorage, devuelve null en vez de lanzar", () => {
    localStorage.setItem(MARCA_CONOCIDA_STORAGE_KEY, "{ esto no es json");
    expect(getMarcaConocida()).toBeNull();
  });

  it("con un valor bien formado pero incompleto (falta colorPrimario), devuelve null", () => {
    localStorage.setItem(
      MARCA_CONOCIDA_STORAGE_KEY,
      JSON.stringify({ empresaId: "e1", nombre: "Empresa X" }),
    );
    expect(getMarcaConocida()).toBeNull();
  });
});
