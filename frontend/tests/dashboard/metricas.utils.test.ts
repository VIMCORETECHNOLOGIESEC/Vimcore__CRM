import { describe, expect, it } from "vitest";
import {
  calculateComparativa,
  calculateDistribucionSemaforo,
  calculateEmbudoPorEtapa,
  calculateMetricasPorAsesor,
  calculateMetricasPorCampania,
  calculateMetricasPorRedSocial,
  calculateRatio,
  calculateRedSocialPorSemaforo,
  calculateResumenMetricas,
} from "@/funcionalidades/dashboard/metricas.utils";
import type { Lead, ResponsableLead } from "@/tipos/lead";
import type { MetricasFiltros } from "@/tipos/metricas";

const asesorA: ResponsableLead = { id: "asesor-a", nombre: "Marta Herrera", rol: "ASESOR" };
const asesorB: ResponsableLead = { id: "asesor-b", nombre: "Julián Peña", rol: "ASESOR" };
const vendedorA: ResponsableLead = { id: "vendedor-a", nombre: "Sofía Vintimilla", rol: "VENDEDOR" };

function leadParcial(overrides: Partial<Lead>): Lead {
  return {
    id: "l1",
    cliente: {
      id: "c1",
      nombre: "Cliente de prueba",
      telefonoOriginal: "0990000000",
      telefonoNormalizado: "+593990000000",
      correoPrincipal: null,
    },
    campania: null,
    origen: "NUEVO",
    redSocial: "FACEBOOK",
    etapa: "NUEVO",
    semaforo: "VERDE",
    puntuacion: 80,
    asesor: null,
    vendedor: null,
    slaInicioEn: null,
    ingresadoEn: "2026-08-02T00:00:00.000Z",
    cerradoEn: null,
    ...overrides,
  };
}

const FILTROS: MetricasFiltros = { fechaDesde: "2026-08-01", fechaHasta: "2026-08-10" };

describe("calculateRatio", () => {
  it("expone numerador, denominador y porcentaje (docs/08 §2.4, '32 % (16 de 50)')", () => {
    expect(calculateRatio(16, 50)).toEqual({ numerador: 16, denominador: 50, porcentaje: 32 });
  });

  it("con denominador 0 devuelve porcentaje 0, nunca NaN", () => {
    expect(calculateRatio(0, 0)).toEqual({ numerador: 0, denominador: 0, porcentaje: 0 });
  });

  it("redondea el porcentaje a un decimal", () => {
    expect(calculateRatio(1, 3).porcentaje).toBe(33.3);
  });
});

describe("calculateComparativa — regla de 'menos de 10 leads' (docs/08 §4)", () => {
  it("con menos de 10 leads en el período anterior, omite el porcentaje y muestra valores absolutos", () => {
    expect(calculateComparativa(12, 3, 3)).toEqual({ actual: 12, anterior: 3, variacionPorcentaje: null });
  });

  it("con 10 o más leads en el período anterior, sí calcula el porcentaje de variación", () => {
    expect(calculateComparativa(15, 10, 10)).toEqual({
      actual: 15,
      anterior: 10,
      variacionPorcentaje: 50,
    });
  });

  it("una baja se representa con un porcentaje negativo", () => {
    expect(calculateComparativa(5, 10, 10).variacionPorcentaje).toBe(-50);
  });

  it("caso límite: de 0 a un valor positivo con volumen suficiente se reporta como 100 % de alza", () => {
    expect(calculateComparativa(5, 0, 12).variacionPorcentaje).toBe(100);
  });

  it("de 0 a 0 con volumen suficiente es 0 % de variación", () => {
    expect(calculateComparativa(0, 0, 12).variacionPorcentaje).toBe(0);
  });
});

describe("calculateResumenMetricas", () => {
  const leads: Lead[] = [
    // Avanzó rápido, respondido en 5h -- dentro del rango.
    leadParcial({
      id: "l1",
      ingresadoEn: "2026-08-02T00:00:00.000Z",
      etapa: "CONTACTADO",
      slaInicioEn: "2026-08-02T05:00:00.000Z",
    }),
    // Venta cerrada dentro del rango, respondida en 10h (dentro de 24h).
    leadParcial({
      id: "l2",
      ingresadoEn: "2026-08-03T00:00:00.000Z",
      etapa: "VENTA",
      cerradoEn: "2026-08-05T00:00:00.000Z",
      slaInicioEn: "2026-08-03T10:00:00.000Z",
    }),
    // No Venta cerrada dentro del rango, nunca fue asignada (no cuenta para primera respuesta/SLA).
    leadParcial({
      id: "l3",
      ingresadoEn: "2026-08-03T00:00:00.000Z",
      etapa: "NO_VENTA",
      cerradoEn: "2026-08-06T00:00:00.000Z",
      slaInicioEn: null,
    }),
    // Asignado pero nunca salió de Nuevo -- "sin primera respuesta".
    leadParcial({
      id: "l4",
      ingresadoEn: "2026-08-04T00:00:00.000Z",
      etapa: "NUEVO",
      slaInicioEn: "2026-08-04T01:00:00.000Z",
    }),
    // Ingresó ANTES del rango, pero sigue en gestión hoy -- cuenta para "en gestión" (snapshot),
    // no para "total ingresados" (docs/08 §2.1 vs §2.2).
    leadParcial({
      id: "l5",
      ingresadoEn: "2026-07-20T00:00:00.000Z",
      etapa: "CONTACTADO",
      slaInicioEn: "2026-07-20T02:00:00.000Z",
    }),
    // Avanzó pero se lo atendió a las 30h -- fuera del umbral de 24h de SLA.
    leadParcial({
      id: "l6",
      ingresadoEn: "2026-08-05T00:00:00.000Z",
      etapa: "CITA",
      slaInicioEn: "2026-08-06T06:00:00.000Z",
    }),
  ];

  const resumen = calculateResumenMetricas(leads, FILTROS);

  it("total de leads ingresados: solo los que ingresaron dentro del rango (docs/08 §2.1)", () => {
    expect(resumen.totalIngresados).toBe(5); // l1,l2,l3,l4,l6 (l5 quedó fuera)
  });

  it("leads en gestión: foto vigente, sin filtrar por rango (docs/08 §2.2)", () => {
    expect(resumen.enGestion).toBe(4); // l1,l4,l5,l6 (excluye l2 Venta y l3 No Venta)
  });

  it("cerrados: por fecha de cierre, desglosado Venta/No Venta (docs/08 §2.3)", () => {
    expect(resumen.cerrados).toEqual({ venta: 1, noVenta: 1 });
  });

  it("tasa de conversión: sobre cerrados, con numerador/denominador expuestos (docs/08 §2.4)", () => {
    expect(resumen.tasaConversion).toEqual({ numerador: 1, denominador: 2, porcentaje: 50 });
  });

  it("tiempo promedio de primera respuesta: aproximado con slaInicioEn - ingresadoEn, solo leads que avanzaron (docs/08 §2.5)", () => {
    // l1: 5h, l2: 10h, l6: 30h -> promedio 15h (l3 sin asignar, l4 nunca salió de Nuevo)
    expect(resumen.tiempoPromedioPrimeraRespuestaHoras).toBe(15);
  });

  it("leads sin primera respuesta: los que nunca salieron de Nuevo en el rango", () => {
    expect(resumen.leadsSinPrimeraRespuesta).toBe(1); // l4
  });

  it("tiempo promedio de cierre: solo Venta, en días (docs/08 §2.6)", () => {
    expect(resumen.tiempoPromedioCierreDias).toBe(2); // l2: 03/08 -> 05/08
  });

  it("tiempo promedio de cierre en No Venta se reporta aparte", () => {
    expect(resumen.tiempoPromedioCierreNoVentaDias).toBe(3); // l3: 03/08 -> 06/08
  });

  it("cumplimiento de SLA: atendidos dentro de 24h / asignados (docs/08 §2.7)", () => {
    // asignados: l1,l2,l4,l6 (4). Atendidos <=24h: l1 (5h), l2 (10h) = 2.
    expect(resumen.cumplimientoSla).toEqual({ numerador: 2, denominador: 4, porcentaje: 50 });
  });

  it("sin leads asignados en el rango, el cumplimiento de SLA es null (no 0 % engañoso)", () => {
    const soloSinAsignar = [leadParcial({ id: "x", ingresadoEn: "2026-08-02T00:00:00.000Z", slaInicioEn: null })];
    expect(calculateResumenMetricas(soloSinAsignar, FILTROS).cumplimientoSla).toBeNull();
  });

  it("comparativa: con volumen insuficiente en el período anterior, omite el porcentaje (docs/08 §4)", () => {
    // Período anterior calculado (2026-07-22..2026-07-31) no tiene ningún lead de este fixture.
    expect(resumen.comparativa.totalIngresados.variacionPorcentaje).toBeNull();
    expect(resumen.comparativa.totalIngresados.anterior).toBe(0);
  });

  it("comparativa: con volumen suficiente en el período anterior, sí calcula el porcentaje", () => {
    const periodoAnteriorConVolumen = Array.from({ length: 12 }, (_, indice) =>
      leadParcial({ id: `anterior-${indice}`, ingresadoEn: "2026-07-25T00:00:00.000Z" }),
    );
    const actual = [
      leadParcial({ id: "actual-1", ingresadoEn: "2026-08-02T00:00:00.000Z" }),
      leadParcial({ id: "actual-2", ingresadoEn: "2026-08-03T00:00:00.000Z" }),
    ];
    const resultado = calculateResumenMetricas([...periodoAnteriorConVolumen, ...actual], FILTROS);
    expect(resultado.comparativa.totalIngresados).toEqual({
      actual: 2,
      anterior: 12,
      variacionPorcentaje: -83.3,
    });
  });
});

describe("calculateResumenMetricas — alcance por rol (docs/08 §1)", () => {
  const leads: Lead[] = [
    leadParcial({ id: "a1", ingresadoEn: "2026-08-02T00:00:00.000Z", asesor: asesorA, vendedor: null }),
    leadParcial({ id: "a2", ingresadoEn: "2026-08-02T00:00:00.000Z", asesor: asesorB, vendedor: null }),
    leadParcial({
      id: "v1",
      ingresadoEn: "2026-08-02T00:00:00.000Z",
      asesor: asesorA,
      vendedor: vendedorA,
    }),
  ];

  it("un asesor solo ve los leads donde es el asesor asignado", () => {
    const resumen = calculateResumenMetricas(leads, FILTROS, { rol: "ASESOR", usuarioId: "asesor-a" });
    // a1 (solo asesor) cuenta; v1 tiene vendedor asignado (getResponsable devolvería el vendedor,
    // pero el alcance por rol de asesor filtra directamente por `lead.asesor.id`, no por responsable operativo).
    expect(resumen.totalIngresados).toBe(2); // a1, v1 (ambos con asesor-a como asesor)
  });

  it("un vendedor solo ve los leads donde es el vendedor asignado", () => {
    const resumen = calculateResumenMetricas(leads, FILTROS, { rol: "VENDEDOR", usuarioId: "vendedor-a" });
    expect(resumen.totalIngresados).toBe(1); // v1
  });

  it("administrador y supervisor ven todos los leads", () => {
    const sinRestriccion = calculateResumenMetricas(leads, FILTROS);
    const comoAdmin = calculateResumenMetricas(leads, FILTROS, { rol: "ADMINISTRADOR", usuarioId: "u1" });
    expect(comoAdmin.totalIngresados).toBe(sinRestriccion.totalIngresados);
    expect(comoAdmin.totalIngresados).toBe(3);
  });
});

describe("calculateMetricasPorRedSocial", () => {
  it("agrupa por red social y calcula la tasa de conversión de cohorte de cada una", () => {
    const leads: Lead[] = [
      leadParcial({ id: "1", redSocial: "INSTAGRAM", ingresadoEn: "2026-08-02T00:00:00.000Z", etapa: "VENTA" }),
      leadParcial({ id: "2", redSocial: "INSTAGRAM", ingresadoEn: "2026-08-02T00:00:00.000Z", etapa: "NO_VENTA" }),
      leadParcial({ id: "3", redSocial: "INSTAGRAM", ingresadoEn: "2026-08-02T00:00:00.000Z", etapa: "NUEVO" }),
      leadParcial({ id: "4", redSocial: "FACEBOOK", ingresadoEn: "2026-08-02T00:00:00.000Z", etapa: "CITA" }),
    ];
    const resultado = calculateMetricasPorRedSocial(leads, FILTROS);

    const instagram = resultado.find((r) => r.redSocial === "INSTAGRAM");
    expect(instagram?.total).toBe(3);
    expect(instagram?.tasaConversion).toEqual({ numerador: 1, denominador: 2, porcentaje: 50 });

    const facebook = resultado.find((r) => r.redSocial === "FACEBOOK");
    expect(facebook?.total).toBe(1);
  });
});

describe("calculateMetricasPorAsesor", () => {
  it("agrupa por responsable operativo, ordena de mayor a menor y calcula conversión/SLA", () => {
    const leads: Lead[] = [
      leadParcial({ id: "1", ingresadoEn: "2026-08-02T00:00:00.000Z", asesor: asesorA, etapa: "VENTA" }),
      leadParcial({ id: "2", ingresadoEn: "2026-08-02T00:00:00.000Z", asesor: asesorA, etapa: "NO_VENTA" }),
      leadParcial({ id: "3", ingresadoEn: "2026-08-02T00:00:00.000Z", asesor: asesorB, etapa: "CONTACTADO" }),
      // Sin responsable -- no debe aparecer agrupado.
      leadParcial({ id: "4", ingresadoEn: "2026-08-02T00:00:00.000Z", asesor: null, vendedor: null }),
    ];
    const resultado = calculateMetricasPorAsesor(leads, FILTROS);

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toMatchObject({ responsableId: "asesor-a", total: 2 });
    expect(resultado[0].tasaConversion).toEqual({ numerador: 1, denominador: 2, porcentaje: 50 });
    expect(resultado[1]).toMatchObject({ responsableId: "asesor-b", total: 1 });
  });
});

describe("calculateEmbudoPorEtapa", () => {
  it("cuenta cada paso del embudo y el % de caída respecto del anterior; No Venta queda aparte (docs/08 §3.3)", () => {
    const leads: Lead[] = [
      leadParcial({ id: "1", ingresadoEn: "2026-08-02T00:00:00.000Z", etapa: "NUEVO" }),
      leadParcial({ id: "2", ingresadoEn: "2026-08-02T00:00:00.000Z", etapa: "NUEVO" }),
      leadParcial({ id: "3", ingresadoEn: "2026-08-02T00:00:00.000Z", etapa: "CONTACTADO" }),
      leadParcial({ id: "4", ingresadoEn: "2026-08-02T00:00:00.000Z", etapa: "CITA" }),
      leadParcial({ id: "5", ingresadoEn: "2026-08-02T00:00:00.000Z", etapa: "VENTA" }),
      leadParcial({ id: "6", ingresadoEn: "2026-08-02T00:00:00.000Z", etapa: "NO_VENTA" }),
    ];
    const embudo = calculateEmbudoPorEtapa(leads, FILTROS);

    expect(embudo.pasos.map((p) => [p.etapa, p.total]))
      .toEqual([["NUEVO", 2], ["CONTACTADO", 1], ["CITA", 1], ["VENTA", 1]]);
    expect(embudo.pasos[0].caidaPorcentaje).toBeNull();
    expect(embudo.pasos[1].caidaPorcentaje).toBe(50); // de 2 a 1
    expect(embudo.pasos[2].caidaPorcentaje).toBe(0); // de 1 a 1
    expect(embudo.noVentaTotal).toBe(1);
  });
});

describe("calculateMetricasPorCampania", () => {
  it("agrupa por (campaña, red social) porque una misma campaña puede correr en redes distintas (docs/08 §3.4)", () => {
    const leads: Lead[] = [
      leadParcial({
        id: "1",
        ingresadoEn: "2026-08-02T00:00:00.000Z",
        campania: { id: "camp-1", nombre: "Verano" },
        redSocial: "INSTAGRAM",
      }),
      leadParcial({
        id: "2",
        ingresadoEn: "2026-08-02T00:00:00.000Z",
        campania: { id: "camp-1", nombre: "Verano" },
        redSocial: "INSTAGRAM",
      }),
      leadParcial({
        id: "3",
        ingresadoEn: "2026-08-02T00:00:00.000Z",
        campania: { id: "camp-1", nombre: "Verano" },
        redSocial: "FACEBOOK",
      }),
      leadParcial({ id: "4", ingresadoEn: "2026-08-02T00:00:00.000Z", campania: null }),
    ];
    const resultado = calculateMetricasPorCampania(leads, FILTROS);

    expect(resultado).toHaveLength(2); // (camp-1, INSTAGRAM) y (camp-1, FACEBOOK) son registros distintos
    const instagram = resultado.find((r) => r.redSocial === "INSTAGRAM");
    expect(instagram).toMatchObject({ campaniaId: "camp-1", nombre: "Verano", total: 2 });
  });

  it("limita a las 10 campañas con más leads", () => {
    const leads: Lead[] = Array.from({ length: 12 }, (_, indice) =>
      leadParcial({
        id: `l${indice}`,
        ingresadoEn: "2026-08-02T00:00:00.000Z",
        campania: { id: `camp-${indice}`, nombre: `Campaña ${indice}` },
      }),
    );
    expect(calculateMetricasPorCampania(leads, FILTROS)).toHaveLength(10);
  });
});

describe("calculateRedSocialPorSemaforo", () => {
  it("incluye todas las etapas (a diferencia de la distribución) y calcula % de verdes por red (docs/08 §3.5)", () => {
    const leads: Lead[] = [
      leadParcial({ id: "1", ingresadoEn: "2026-08-02T00:00:00.000Z", redSocial: "INSTAGRAM", semaforo: "VERDE" }),
      leadParcial({ id: "2", ingresadoEn: "2026-08-02T00:00:00.000Z", redSocial: "INSTAGRAM", semaforo: "ROJO" }),
      leadParcial({
        id: "3",
        ingresadoEn: "2026-08-02T00:00:00.000Z",
        redSocial: "INSTAGRAM",
        etapa: "VENTA",
        semaforo: "VERDE",
      }),
    ];
    const resultado = calculateRedSocialPorSemaforo(leads, FILTROS);
    const instagram = resultado.find((r) => r.redSocial === "INSTAGRAM");
    expect(instagram).toMatchObject({ verde: 2, amarillo: 0, rojo: 1, total: 3, porcentajeVerde: 66.7 });
  });
});

describe("calculateDistribucionSemaforo", () => {
  it("excluye Venta y No Venta -- solo leads en gestión (docs/08 §3.6)", () => {
    const leads: Lead[] = [
      leadParcial({ id: "1", ingresadoEn: "2026-08-02T00:00:00.000Z", etapa: "NUEVO", semaforo: "VERDE" }),
      leadParcial({ id: "2", ingresadoEn: "2026-08-02T00:00:00.000Z", etapa: "CONTACTADO", semaforo: "ROJO" }),
      leadParcial({ id: "3", ingresadoEn: "2026-08-02T00:00:00.000Z", etapa: "VENTA", semaforo: "VERDE" }),
      leadParcial({ id: "4", ingresadoEn: "2026-08-02T00:00:00.000Z", etapa: "NO_VENTA", semaforo: "ROJO" }),
    ];
    const resultado = calculateDistribucionSemaforo(leads, FILTROS);

    expect(resultado).toEqual([
      { semaforo: "VERDE", total: 1 },
      { semaforo: "AMARILLO", total: 0 },
      { semaforo: "ROJO", total: 1 },
    ]);
  });
});
