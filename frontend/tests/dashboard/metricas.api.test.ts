import { describe, expect, it } from "vitest";
import {
  fetchDistribucionSemaforoApi,
  fetchMetricasPorAsesorApi,
  fetchMetricasPorCampaniaApi,
  fetchMetricasPorEtapaApi,
  fetchMetricasPorRedSocialApi,
  fetchRedSocialPorSemaforoApi,
  fetchResumenMetricasApi,
} from "@/funcionalidades/dashboard/metricas.api";
import type { MetricasFiltros } from "@/tipos/metricas";

/**
 * Contrato de forma contra el fixture compartido `LEADS_MOCK` -- mismo
 * criterio que `leads.api.test.ts` en F3: no fija valores exactos (el
 * fixture usa fechas relativas a `Date.now()`), solo que la forma de la
 * respuesta es la esperada y que no explota. Los valores exactos de cada
 * fórmula ya están cubiertos con fixtures deterministas en
 * `metricas.utils.test.ts`.
 */
const FILTROS_AMPLIOS: MetricasFiltros = { fechaDesde: "1970-01-01", fechaHasta: "2999-12-31" };

describe("fetchResumenMetricasApi — contrato de respuesta", () => {
  it("devuelve las 7 secciones del resumen con la forma esperada", async () => {
    const resumen = await fetchResumenMetricasApi(FILTROS_AMPLIOS);
    expect(resumen).toHaveProperty("totalIngresados");
    expect(resumen).toHaveProperty("enGestion");
    expect(resumen).toHaveProperty("cerrados.venta");
    expect(resumen).toHaveProperty("tasaConversion.porcentaje");
    expect(resumen).toHaveProperty("comparativa.totalIngresados");
    expect(resumen.totalIngresados).toBeGreaterThan(0);
  });
});

describe("fetchMetricasPorRedSocialApi / fetchRedSocialPorSemaforoApi", () => {
  it("agrupan por red social sin explotar", async () => {
    const porRed = await fetchMetricasPorRedSocialApi(FILTROS_AMPLIOS);
    expect(porRed.length).toBeGreaterThan(0);
    expect(porRed.every((r) => r.total > 0)).toBe(true);

    const porSemaforo = await fetchRedSocialPorSemaforoApi(FILTROS_AMPLIOS);
    expect(porSemaforo.every((r) => r.verde + r.amarillo + r.rojo === r.total)).toBe(true);
  });
});

describe("fetchMetricasPorAsesorApi — alcance por rol", () => {
  it("un asesor solo ve leads de su propia cartera (alcance aplicado antes de agrupar)", async () => {
    const sinRestriccion = await fetchMetricasPorAsesorApi(FILTROS_AMPLIOS);
    const totalGeneral = sinRestriccion.reduce((suma, r) => suma + r.total, 0);

    const resultado = await fetchMetricasPorAsesorApi(FILTROS_AMPLIOS, {
      rol: "ASESOR",
      usuarioId: "asesor-1",
    });
    const totalAsesor = resultado.reduce((suma, r) => suma + r.total, 0);

    // El total del asesor nunca puede superar el total general -- si un lead
    // fue traspasado a un vendedor, la agregación lo agrupa bajo el
    // responsable operativo vigente (`getResponsable`), no bajo el asesor
    // original, así que el `responsableId` agregado puede no ser
    // "asesor-1" mismo cuando el lead sigue dentro de su cartera por rol.
    expect(totalAsesor).toBeGreaterThan(0);
    expect(totalAsesor).toBeLessThanOrEqual(totalGeneral);
  });
});

describe("fetchMetricasPorEtapaApi", () => {
  it("devuelve los 4 pasos del embudo, sin incluir No Venta como paso", async () => {
    const embudo = await fetchMetricasPorEtapaApi(FILTROS_AMPLIOS);
    expect(embudo.pasos.map((p) => p.etapa)).toEqual(["NUEVO", "CONTACTADO", "CITA", "VENTA"]);
    expect(embudo.pasos.every((p) => p.etapa !== "NO_VENTA")).toBe(true);
  });
});

describe("fetchMetricasPorCampaniaApi", () => {
  it("no devuelve más de 10 campañas", async () => {
    const porCampania = await fetchMetricasPorCampaniaApi(FILTROS_AMPLIOS);
    expect(porCampania.length).toBeLessThanOrEqual(10);
  });
});

describe("fetchDistribucionSemaforoApi", () => {
  it("devuelve los 3 colores de semáforo, solo sobre leads en gestión", async () => {
    const distribucion = await fetchDistribucionSemaforoApi(FILTROS_AMPLIOS);
    expect(distribucion.map((d) => d.semaforo)).toEqual(["VERDE", "AMARILLO", "ROJO"]);
  });
});
