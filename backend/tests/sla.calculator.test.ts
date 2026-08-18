import { describe, expect, it } from "vitest";
import { calculateEstadoSla, slaFilterBoundaries } from "../src/services/sla.calculator.js";

const AHORA = new Date("2026-08-14T12:00:00.000Z");

describe("services/sla.calculator — calculateEstadoSla (pura, sin BD, DD6)", () => {
  it("sin_iniciar cuando slaInicioEn es null (D9, sin asesor asignado)", () => {
    expect(calculateEstadoSla(null, null, AHORA)).toBe("sin_iniciar");
  });

  it("a_tiempo cuando queda más del 25% del plazo (0h transcurridas)", () => {
    const slaInicioEn = AHORA;
    expect(calculateEstadoSla(slaInicioEn, null, AHORA)).toBe("a_tiempo");
  });

  it("en_riesgo exactamente a las 18h transcurridas (docs/02 §7, restante = 25%)", () => {
    const slaInicioEn = new Date(AHORA.getTime() - 18 * 60 * 60 * 1000);
    expect(calculateEstadoSla(slaInicioEn, null, AHORA)).toBe("en_riesgo");
  });

  it("a_tiempo justo antes de las 18h (17h59m transcurridas)", () => {
    const slaInicioEn = new Date(AHORA.getTime() - (18 * 60 * 60 * 1000 - 60_000));
    expect(calculateEstadoSla(slaInicioEn, null, AHORA)).toBe("a_tiempo");
  });

  it("atrasado cuando el plazo de 24h ya venció", () => {
    const slaInicioEn = new Date(AHORA.getTime() - 25 * 60 * 60 * 1000);
    expect(calculateEstadoSla(slaInicioEn, null, AHORA)).toBe("atrasado");
  });

  it("reloj detenido: un lead cerrado hace tiempo no se vuelve más atrasado con el paso del tiempo (D-DD6)", () => {
    const slaInicioEn = new Date(AHORA.getTime() - 20 * 60 * 60 * 1000);
    const cerradoEn = new Date(AHORA.getTime() - 19 * 60 * 60 * 1000); // cerrado con 1h transcurrida
    const muchoDespues = new Date(AHORA.getTime() + 1000 * 60 * 60 * 24 * 365);
    expect(calculateEstadoSla(slaInicioEn, cerradoEn, muchoDespues)).toBe("a_tiempo");
  });
});

describe("services/sla.calculator — slaFilterBoundaries (DD6, fronteras para filtrar GET /leads)", () => {
  it("un slaInicioEn justo en la frontera de riesgo cae en en_riesgo, no en a_tiempo", () => {
    const { fronteraRiesgo } = slaFilterBoundaries(AHORA);
    expect(calculateEstadoSla(fronteraRiesgo, null, AHORA)).toBe("en_riesgo");
  });

  it("un slaInicioEn justo en la frontera de atraso cae en atrasado, no en en_riesgo", () => {
    const { fronteraAtrasado } = slaFilterBoundaries(AHORA);
    expect(calculateEstadoSla(fronteraAtrasado, null, AHORA)).toBe("atrasado");
  });
});
