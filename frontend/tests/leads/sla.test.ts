import { describe, expect, it } from "vitest";
import { calculateEstadoSla, formatDuracionHms, SLA_HORAS } from "@/funcionalidades/leads/sla";

const AHORA = new Date("2026-08-13T12:00:00.000Z");

function hoursAgo(horas: number): string {
  return new Date(AHORA.getTime() - horas * 60 * 60 * 1000).toISOString();
}

describe("formatDuracionHms", () => {
  it("formatea milisegundos a HH:MM:SS con ceros a la izquierda", () => {
    expect(formatDuracionHms(0)).toBe("00:00:00");
    expect(formatDuracionHms(5_000)).toBe("00:00:05");
    expect(formatDuracionHms(65_000)).toBe("00:01:05");
    expect(formatDuracionHms(3_661_000)).toBe("01:01:01");
  });

  it("trunca los milisegundos sobrantes en vez de redondear", () => {
    expect(formatDuracionHms(1_999)).toBe("00:00:01");
  });

  it("no tiene límite superior de horas (no rota a días)", () => {
    expect(formatDuracionHms(30 * 60 * 60 * 1000)).toBe("30:00:00");
  });
});

describe("calculateEstadoSla", () => {
  it("SLA_HORAS es 24, la constante documentada en docs/02-reglas-negocio.md §7", () => {
    expect(SLA_HORAS).toBe(24);
  });

  it("está 'A_TIEMPO' recién asignado, con las 24 horas completas restantes", () => {
    const resultado = calculateEstadoSla({
      slaInicioEn: AHORA.toISOString(),
      cerradoEn: null,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe("A_TIEMPO");
    expect(resultado.etiqueta).toBe("A tiempo (24:00:00)");
  });

  it("está 'A_TIEMPO' justo antes de las 18 horas transcurridas (25% restante)", () => {
    const resultado = calculateEstadoSla({
      slaInicioEn: hoursAgo(17.99),
      cerradoEn: null,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe("A_TIEMPO");
  });

  it("pasa a 'EN_RIESGO' exactamente a las 18 horas transcurridas (docs/02 §7)", () => {
    const resultado = calculateEstadoSla({
      slaInicioEn: hoursAgo(18),
      cerradoEn: null,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe("EN_RIESGO");
    expect(resultado.etiqueta).toBe("En riesgo (06:00:00)");
  });

  it("sigue 'EN_RIESGO' justo antes de las 24 horas transcurridas", () => {
    const resultado = calculateEstadoSla({
      slaInicioEn: hoursAgo(23.99),
      cerradoEn: null,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe("EN_RIESGO");
  });

  it("pasa a 'ATRASADO' exactamente al vencer el plazo de 24 horas", () => {
    const resultado = calculateEstadoSla({
      slaInicioEn: hoursAgo(24),
      cerradoEn: null,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe("ATRASADO");
    expect(resultado.etiqueta).toBe("Atrasado (-00:00:00)");
  });

  it("'ATRASADO' muestra el tiempo excedido con signo negativo", () => {
    const resultado = calculateEstadoSla({
      slaInicioEn: hoursAgo(25),
      cerradoEn: null,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe("ATRASADO");
    expect(resultado.etiqueta).toBe("Atrasado (-01:00:00)");
    expect(resultado.restanteMs).toBeLessThan(0);
  });

  it("es 'CERRADO' cuando el lead tiene cerradoEn, sin importar el tiempo transcurrido", () => {
    const resultado = calculateEstadoSla({
      slaInicioEn: hoursAgo(100),
      cerradoEn: AHORA.toISOString(),
      ahora: AHORA,
    });
    expect(resultado.estado).toBe("CERRADO");
    expect(resultado.etiqueta).toBe("Cerrado");
  });

  it("es 'CERRADO' cuando el lead nunca fue asignado (slaInicioEn nulo)", () => {
    const resultado = calculateEstadoSla({ slaInicioEn: null, cerradoEn: null, ahora: AHORA });
    expect(resultado.estado).toBe("CERRADO");
  });
});
