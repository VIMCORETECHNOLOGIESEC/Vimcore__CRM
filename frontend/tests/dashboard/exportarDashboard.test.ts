import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  construirWorkbookExcel,
  type DashboardExportContext,
  type DashboardExportData,
} from "@/funcionalidades/dashboard/exportarDashboard";
import type { Lead } from "@/tipos/lead";
import type { ResumenMetricas } from "@/tipos/metricas";

/**
 * `construirWorkbookExcel` -- lógica no trivial de armado de un workbook real
 * de SheetJS (AGENTS.md §5; docs/propuesta-consolidacion-exportacion-reportes.md
 * §5.3, decisión 3). Se testea la estructura de datos devuelta por SheetJS
 * (`XLSX.utils.sheet_to_json` / lectura directa de celdas) en vez de pasar
 * por el mecanismo de descarga del DOM -- mismo criterio que
 * `carga-masiva.utils.test.ts` para la lectura, separado del efecto
 * secundario que sí testea `DashboardExportar.test.tsx`.
 */

const CONTEXTO: DashboardExportContext = {
  rango: "01/08/2026 - 07/08/2026",
  filtros: ["Red social: Instagram", "Campaña: Verano"],
  empresa: { nombre: "Empresa Demo", usuario: "Usuaria de prueba", correo: "u1@crm.test" },
};

const RESUMEN: ResumenMetricas = {
  rango: { desde: "2026-08-01", hasta: "2026-08-07" },
  totalIngresados: { actual: 40, anterior: 30, variacionPorcentual: 33.3 },
  enGestion: { actual: 12, anterior: 10, variacionPorcentual: 20 },
  cerrados: {
    total: { actual: 28, anterior: 20, variacionPorcentual: 40 },
    venta: { actual: 10, anterior: 8, variacionPorcentual: 25 },
    noVenta: { actual: 18, anterior: 12, variacionPorcentual: 50 },
  },
  tasaConversion: {
    actual: { porcentaje: 35.7, venta: 10, total: 28 },
    anterior: { porcentaje: 40, venta: 8, total: 20 },
    variacionPorcentual: -10.75,
  },
  tiempoPrimeraRespuesta: {
    horasPromedio: 2.4,
    sinPrimeraRespuesta: 1,
    anteriorHorasPromedio: 3.1,
    variacionPorcentual: -22.6,
  },
  tiempoPromedioCierre: { diasPromedio: 3.2, anteriorDiasPromedio: 4, variacionPorcentual: -20 },
  cumplimientoSla: { porcentaje: 88.5, anteriorPorcentaje: 80, variacionPorcentual: 10.6 },
  distribucionSemaforo: { rojo: 3, amarillo: 5, verde: 4, sinCalificar: 0 },
};

function leadFake(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    cliente: {
      id: "cliente-1",
      nombre: "María Cabrera",
      telefonoOriginal: "0991234567",
      telefonoNormalizado: "+593991234567",
      correoPrincipal: "maria@correo.test",
    },
    campania: { id: "camp-1", nombre: "Verano" },
    origen: "NUEVO",
    redSocial: "INSTAGRAM",
    etapa: "VENTA",
    semaforo: "VERDE",
    puntuacion: 90,
    asesor: null,
    vendedor: { id: "u2", nombre: "Vendedor Uno", rol: "VENDEDOR" },
    slaInicioEn: "2026-08-01T10:00:00.000Z",
    ingresadoEn: "2026-08-01T10:00:00.000Z",
    cerradoEn: "2026-08-02T10:00:00.000Z",
    ...overrides,
  };
}

function dataCompleta(): DashboardExportData {
  return {
    resumen: RESUMEN,
    porRedSocial: [
      { redSocial: "INSTAGRAM", total: 20, ventas: 6, noVentas: 8, tasaConversionPct: 42.8 },
      { redSocial: "FACEBOOK", total: 20, ventas: 4, noVentas: 10, tasaConversionPct: 28.5 },
    ],
    porAsesor: [
      {
        responsableId: "u2",
        nombre: "Vendedor Uno",
        total: 15,
        ventas: 5,
        noVentas: 6,
        tasaConversionPct: 45.4,
        cumplimientoSlaPct: 90,
      },
    ],
    porCampania: [{ nombreCampania: "Verano", redSocial: "INSTAGRAM", total: 20 }],
    embudo: {
      pasos: [
        { etapa: "NUEVO", total: 40, caidaPct: null },
        { etapa: "CONTACTADO", total: 30, caidaPct: 25 },
        { etapa: "CITA", total: 20, caidaPct: 33.3 },
        { etapa: "VENTA", total: 10, caidaPct: 50 },
      ],
      noVenta: 18,
    },
    redSocialPorSemaforo: [
      { redSocial: "INSTAGRAM", total: 20, rojo: 3, amarillo: 5, verde: 12, sinCalificar: 0, pctVerde: 60 },
    ],
    leads: [leadFake()],
  };
}

function nombresHojas(libro: XLSX.WorkBook): string[] {
  return libro.SheetNames;
}

function filasDe(libro: XLSX.WorkBook, hoja: string): unknown[][] {
  const worksheet = libro.Sheets[hoja];
  return XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });
}

describe("construirWorkbookExcel — estructura de hojas", () => {
  it("arma exactamente las 8 hojas esperadas, una por sección, en orden", () => {
    const libro = construirWorkbookExcel(dataCompleta(), CONTEXTO);

    expect(nombresHojas(libro)).toEqual([
      "Información",
      "Resumen ejecutivo",
      "Embudo por etapa",
      "Leads por red social",
      "Leads por asesor",
      "Leads por campaña",
      "Red social por semáforo",
      "Lista de leads",
    ]);
  });

  it("la hoja Información trae el encabezado de contexto y la conclusión narrativa", () => {
    const libro = construirWorkbookExcel(dataCompleta(), CONTEXTO);
    const filas = filasDe(libro, "Información");

    expect(filas).toContainEqual(["Empresa", "Empresa Demo"]);
    expect(filas).toContainEqual(["Responsable del informe", "Usuaria de prueba"]);
    expect(filas).toContainEqual(["Correo", "u1@crm.test"]);
    expect(filas).toContainEqual(["Período", "01/08/2026 - 07/08/2026"]);
    expect(filas).toContainEqual(["Filtros", "Red social: Instagram | Campaña: Verano"]);
    expect(filas.some((fila) => String(fila[0]).includes("40 leads"))).toBe(true);
  });
});

describe("construirWorkbookExcel — no pierde datos frente al CSV anterior", () => {
  it("Resumen ejecutivo incluye los 7 indicadores que armaba el CSV, con números como números", () => {
    const libro = construirWorkbookExcel(dataCompleta(), CONTEXTO);
    const filas = filasDe(libro, "Resumen ejecutivo");

    expect(filas[0]).toEqual(["Indicador", "Valor"]);
    expect(filas).toContainEqual(["Leads ingresados", 40]);
    expect(filas).toContainEqual(["Leads en gestión", 12]);
    expect(filas).toContainEqual(["Leads cerrados", 28]);
    expect(filas).toContainEqual(["Ventas", 10]);
    expect(filas).toContainEqual(["No venta", 18]);
    expect(filas).toContainEqual(["Conversión", "35.7%"]);
    expect(filas).toContainEqual(["Cumplimiento SLA", "88.5%"]);

    const filaVentas = filas.find((fila) => fila[0] === "Ventas");
    expect(typeof filaVentas?.[1]).toBe("number");
  });

  it("sin resumen, la hoja queda con una fila honesta 'Sin datos' en vez de romper", () => {
    const libro = construirWorkbookExcel({ leads: [] }, CONTEXTO);
    const filas = filasDe(libro, "Resumen ejecutivo");

    expect(filas).toEqual([["Indicador", "Valor"], ["Sin datos", ""]]);
  });

  it("Embudo por etapa incluye los 4 pasos más 'No venta' aparte, con totales numéricos", () => {
    const libro = construirWorkbookExcel(dataCompleta(), CONTEXTO);
    const filas = filasDe(libro, "Embudo por etapa");

    expect(filas[0]).toEqual(["Etapa", "Total", "Caída"]);
    expect(filas).toContainEqual(["NUEVO", 40, "-"]);
    expect(filas).toContainEqual(["CONTACTADO", 30, "25%"]);
    expect(filas).toContainEqual(["VENTA", 10, "50%"]);
    expect(filas).toContainEqual(["No venta", 18, "-"]);
  });

  it("Leads por red social conserva las 5 columnas del CSV anterior", () => {
    const libro = construirWorkbookExcel(dataCompleta(), CONTEXTO);
    const filas = filasDe(libro, "Leads por red social");

    expect(filas[0]).toEqual(["Red social", "Total", "Ventas", "No ventas", "Conversión"]);
    expect(filas).toContainEqual(["INSTAGRAM", 20, 6, 8, "42.8%"]);
    expect(filas).toContainEqual(["FACEBOOK", 20, 4, 10, "28.5%"]);
  });

  it("Leads por asesor conserva las 6 columnas del CSV anterior, incluido SLA", () => {
    const libro = construirWorkbookExcel(dataCompleta(), CONTEXTO);
    const filas = filasDe(libro, "Leads por asesor");

    expect(filas[0]).toEqual(["Responsable", "Total", "Ventas", "No ventas", "Conversión", "SLA"]);
    expect(filas).toContainEqual(["Vendedor Uno", 15, 5, 6, "45.4%", "90%"]);
  });

  it("Leads por campaña usa 'Sin red' cuando la campaña no tiene red social asociada", () => {
    const data: DashboardExportData = {
      ...dataCompleta(),
      porCampania: [{ nombreCampania: "Sin campaña asociada", redSocial: null, total: 5 }],
    };
    const libro = construirWorkbookExcel(data, CONTEXTO);
    const filas = filasDe(libro, "Leads por campaña");

    expect(filas).toContainEqual(["Sin campaña asociada", "Sin red", 5]);
  });

  it("Red social por semáforo conserva las 6 columnas del CSV anterior", () => {
    const libro = construirWorkbookExcel(dataCompleta(), CONTEXTO);
    const filas = filasDe(libro, "Red social por semáforo");

    expect(filas[0]).toEqual(["Red social", "Total", "Rojo", "Amarillo", "Verde", "Sin calificar"]);
    expect(filas).toContainEqual(["INSTAGRAM", 20, 3, 5, 12, 0]);
  });

  it("Lista de leads conserva las 6 columnas del CSV anterior, incluida la etapa y responsable operativo", () => {
    const libro = construirWorkbookExcel(dataCompleta(), CONTEXTO);
    const filas = filasDe(libro, "Lista de leads");

    expect(filas[0]).toEqual(["Cliente", "Teléfono", "Etapa", "Red social", "Responsable", "Ingreso"]);
    expect(filas).toContainEqual([
      "María Cabrera",
      "0991234567",
      "Venta",
      "Instagram",
      "Vendedor Uno",
      new Intl.DateTimeFormat("es-EC").format(new Date("2026-08-01T10:00:00.000Z")),
    ]);
  });

  it("un lead sin asesor ni vendedor asignado se lista como 'Sin asignar'", () => {
    const data: DashboardExportData = {
      ...dataCompleta(),
      leads: [leadFake({ asesor: null, vendedor: null })],
    };
    const libro = construirWorkbookExcel(data, CONTEXTO);
    const filas = filasDe(libro, "Lista de leads");

    expect(filas[1]?.[4]).toBe("Sin asignar");
  });
});
