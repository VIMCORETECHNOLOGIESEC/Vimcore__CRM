import { describe, expect, it } from "vitest";
import { evaluarAvisoBridge, formatFecha, tieneAvisoDestacado } from "@/funcionalidades/bridges/bridges.utils";
import type { Bridge } from "@/tipos/bridge";

const AHORA = new Date("2026-08-14T12:00:00.000Z");

function bridgeFake(overrides: Partial<Bridge> = {}): Bridge {
  return {
    id: "bridge-1",
    redSocial: "FACEBOOK",
    nombre: "Meta Ads",
    estado: "ACTIVO",
    tokenExpiraEn: null,
    ultimoLeadEn: null,
    cuentasPublicitarias: [],
    ...overrides,
  };
}

function horasAntes(horas: number): string {
  return new Date(AHORA.getTime() - horas * 60 * 60 * 1000).toISOString();
}

describe("evaluarAvisoBridge — token expirado", () => {
  it("marca tokenExpirado únicamente cuando el estado es TOKEN_EXPIRADO", () => {
    const bridge = bridgeFake({ estado: "TOKEN_EXPIRADO" });
    expect(evaluarAvisoBridge(bridge, AHORA).tokenExpirado).toBe(true);
  });

  it("no marca tokenExpirado para ERROR, aunque también sea una condición anómala", () => {
    const bridge = bridgeFake({ estado: "ERROR" });
    expect(evaluarAvisoBridge(bridge, AHORA).tokenExpirado).toBe(false);
  });
});

describe("evaluarAvisoBridge — sin actividad (docs/05 §8, 72 horas con cuentas activas)", () => {
  it("marca sinActividad cuando pasaron 72 h o más desde el último lead, con una cuenta activa", () => {
    const bridge = bridgeFake({
      ultimoLeadEn: horasAntes(72),
      cuentasPublicitarias: [{ id: "c1", idExterno: "act_1", nombre: "Cuenta", activa: true }],
    });
    expect(evaluarAvisoBridge(bridge, AHORA).sinActividad).toBe(true);
  });

  it("no marca sinActividad con menos de 72 h desde el último lead", () => {
    const bridge = bridgeFake({
      ultimoLeadEn: horasAntes(10),
      cuentasPublicitarias: [{ id: "c1", idExterno: "act_1", nombre: "Cuenta", activa: true }],
    });
    expect(evaluarAvisoBridge(bridge, AHORA).sinActividad).toBe(false);
  });

  it("marca sinActividad cuando nunca recibió un lead (ultimoLeadEn nulo), con cuenta activa", () => {
    const bridge = bridgeFake({
      ultimoLeadEn: null,
      cuentasPublicitarias: [{ id: "c1", idExterno: "act_1", nombre: "Cuenta", activa: true }],
    });
    expect(evaluarAvisoBridge(bridge, AHORA).sinActividad).toBe(true);
  });

  it("no marca sinActividad si ninguna cuenta publicitaria está activa", () => {
    const bridge = bridgeFake({
      ultimoLeadEn: null,
      cuentasPublicitarias: [{ id: "c1", idExterno: "act_1", nombre: "Cuenta", activa: false }],
    });
    expect(evaluarAvisoBridge(bridge, AHORA).sinActividad).toBe(false);
  });

  it("no marca sinActividad si no hay ninguna cuenta publicitaria asociada", () => {
    const bridge = bridgeFake({ ultimoLeadEn: null, cuentasPublicitarias: [] });
    expect(evaluarAvisoBridge(bridge, AHORA).sinActividad).toBe(false);
  });

  it("un bridge INACTIVO nunca dispara sinActividad, aunque nunca haya recibido leads con cuenta activa", () => {
    const bridge = bridgeFake({
      estado: "INACTIVO",
      ultimoLeadEn: null,
      cuentasPublicitarias: [{ id: "c1", idExterno: "act_1", nombre: "Cuenta", activa: true }],
    });
    expect(evaluarAvisoBridge(bridge, AHORA).sinActividad).toBe(false);
  });
});

describe("tieneAvisoDestacado", () => {
  it("es true si cualquiera de las dos banderas es true", () => {
    expect(tieneAvisoDestacado({ tokenExpirado: true, sinActividad: false })).toBe(true);
    expect(tieneAvisoDestacado({ tokenExpirado: false, sinActividad: true })).toBe(true);
  });

  it("es false cuando ninguna bandera está activa", () => {
    expect(tieneAvisoDestacado({ tokenExpirado: false, sinActividad: false })).toBe(false);
  });
});

describe("formatFecha", () => {
  it("formatea en DD/MM/AAAA HH:mm (docs/07, formato de fechas)", () => {
    const iso = new Date(2026, 2, 5, 8, 7).toISOString();
    expect(formatFecha(iso)).toBe("05/03/2026 08:07");
  });
});
