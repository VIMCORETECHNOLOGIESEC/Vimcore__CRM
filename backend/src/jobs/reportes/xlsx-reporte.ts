import ExcelJS from "exceljs";
import type { DatosReporte } from "./tipos.js";

/**
 * `exceljs`, una hoja por métrica, SIN gráficos nativos de Excel -- decisión
 * firme de docs/blocks/e-dashboards.md ("Exportación PDF/XLSX"), no
 * negociable en este batch.
 */
export async function generarXlsxReporte(datos: DatosReporte): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CRM Embudo de Leads";
  workbook.created = new Date();

  const resumenSheet = workbook.addWorksheet("Resumen");
  resumenSheet.addRow(["Indicador", "Actual", "Anterior"]);
  resumenSheet.addRow(["Total ingresados", datos.resumen.totalIngresados.actual, datos.resumen.totalIngresados.anterior]);
  resumenSheet.addRow(["En gestión", datos.resumen.enGestion.actual, datos.resumen.enGestion.anterior]);
  resumenSheet.addRow(["Cerrados (venta)", datos.resumen.cerrados.venta.actual, datos.resumen.cerrados.venta.anterior]);
  resumenSheet.addRow(["Cerrados (no venta)", datos.resumen.cerrados.noVenta.actual, datos.resumen.cerrados.noVenta.anterior]);
  resumenSheet.addRow([
    "Tasa de conversión (%)",
    datos.resumen.tasaConversion.actual.porcentaje,
    datos.resumen.tasaConversion.anterior.porcentaje,
  ]);

  const embudoSheet = workbook.addWorksheet("Embudo");
  embudoSheet.addRow(["Etapa", "Total", "Caída (%)"]);
  for (const paso of datos.embudo.pasos) {
    embudoSheet.addRow([paso.etapa, paso.total, paso.caidaPct]);
  }

  const canalSheet = workbook.addWorksheet("Rendimiento por canal");
  canalSheet.addRow(["Campaña", "Red social", "Moneda", "Gasto", "Clics", "Leads", "Ventas", "CPC", "CPL", "CAC"]);
  for (const fila of datos.rendimientoCampanias) {
    canalSheet.addRow([
      fila.nombreCampania,
      fila.redSocial,
      fila.moneda,
      fila.gasto,
      fila.clics,
      fila.leads,
      fila.ventas,
      fila.cpc,
      fila.cpl,
      fila.cac,
    ]);
  }

  if (datos.porAsesor) {
    const asesorSheet = workbook.addWorksheet("Por asesor");
    asesorSheet.addRow(["Asesor", "Total", "Ventas", "No ventas", "Conversión (%)", "SLA (%)"]);
    for (const fila of datos.porAsesor) {
      asesorSheet.addRow([
        fila.nombre,
        fila.total,
        fila.ventas,
        fila.noVentas,
        fila.tasaConversionPct,
        fila.cumplimientoSlaPct,
      ]);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
