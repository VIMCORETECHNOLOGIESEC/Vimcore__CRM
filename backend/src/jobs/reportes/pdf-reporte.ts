import puppeteer from "puppeteer";
import type { DatosReporte } from "./tipos.js";

function escapeHtml(valor: string): string {
  return valor
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatoPct(valor: number | null): string {
  return valor === null ? "—" : `${valor.toFixed(2)}%`;
}

function formatoCosto(valor: number | null, moneda: string): string {
  return valor === null ? "—" : `${moneda} ${valor.toFixed(2)}`;
}

/**
 * reportes (Bloque E, docs/blocks/e-dashboards.md "Exportación PDF/XLSX"):
 * estructura exacta del documento -- portada -> resumen ejecutivo -> embudo
 * -> rendimiento por canal (CPC/CPL/CAC) -> rendimiento por asesor (D6) ->
 * desglose por empresa si es holding-wide.
 *
 * TODO(reportes, Bloque E): "desglose por empresa si es reporte holding-wide"
 * no tiene todavía una función de agregación por empresa en
 * `metricas.service.ts` -- sección pendiente de una futura
 * `getResumenPorEmpresa`/equivalente.
 */
function renderHtml(datos: DatosReporte): string {
  const generadoEn = new Date().toLocaleString("es-AR", { timeZone: "UTC" });
  const alcance = datos.empresaId === null ? "Holding (todas las empresas)" : `Empresa ${escapeHtml(datos.empresaId)}`;

  const filasCampania = datos.rendimientoCampanias
    .map(
      (fila) =>
        `<tr><td>${escapeHtml(fila.nombreCampania)}</td><td>${fila.redSocial}</td><td>${fila.moneda}</td><td>${fila.gasto.toFixed(2)}</td><td>${fila.clics}</td><td>${fila.leads}</td><td>${fila.ventas}</td><td>${formatoCosto(fila.cpc, fila.moneda)}</td><td>${formatoCosto(fila.cpl, fila.moneda)}</td><td>${formatoCosto(fila.cac, fila.moneda)}</td></tr>`,
    )
    .join("");

  const seccionAsesor = datos.porAsesor
    ? `<h2>Rendimiento por asesor</h2>
       <table>
         <thead><tr><th>Asesor</th><th>Total</th><th>Ventas</th><th>No ventas</th><th>Conversión</th><th>SLA</th></tr></thead>
         <tbody>${datos.porAsesor
           .map(
             (fila) =>
               `<tr><td>${escapeHtml(fila.nombre)}</td><td>${fila.total}</td><td>${fila.ventas}</td><td>${fila.noVentas}</td><td>${formatoPct(fila.tasaConversionPct)}</td><td>${formatoPct(fila.cumplimientoSlaPct)}</td></tr>`,
           )
           .join("")}</tbody>
       </table>`
    : "<h2>Rendimiento por asesor</h2><p>No disponible para el rol del solicitante.</p>";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Arial, sans-serif; color: #1a1a1a; margin: 40px; }
  h1 { font-size: 28px; }
  h2 { font-size: 18px; margin-top: 32px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 12px; }
  th { background: #f2f2f2; }
  .portada { text-align: center; margin-top: 200px; }
</style>
</head>
<body>
  <section class="portada">
    <h1>Reporte de embudo de leads</h1>
    <p>${alcance}</p>
    <p>Generado el ${escapeHtml(generadoEn)} UTC</p>
  </section>
  <div style="page-break-after: always;"></div>

  <h2>Resumen ejecutivo</h2>
  <table>
    <thead><tr><th>Indicador</th><th>Actual</th><th>Anterior</th></tr></thead>
    <tbody>
      <tr><td>Total ingresados</td><td>${datos.resumen.totalIngresados.actual}</td><td>${datos.resumen.totalIngresados.anterior}</td></tr>
      <tr><td>En gestión</td><td>${datos.resumen.enGestion.actual}</td><td>${datos.resumen.enGestion.anterior}</td></tr>
      <tr><td>Cerrados (venta)</td><td>${datos.resumen.cerrados.venta.actual}</td><td>${datos.resumen.cerrados.venta.anterior}</td></tr>
      <tr><td>Cerrados (no venta)</td><td>${datos.resumen.cerrados.noVenta.actual}</td><td>${datos.resumen.cerrados.noVenta.anterior}</td></tr>
      <tr><td>Tasa de conversión</td><td>${formatoPct(datos.resumen.tasaConversion.actual.porcentaje)}</td><td>${formatoPct(datos.resumen.tasaConversion.anterior.porcentaje)}</td></tr>
    </tbody>
  </table>

  <h2>Embudo</h2>
  <table>
    <thead><tr><th>Etapa</th><th>Total</th><th>Caída</th></tr></thead>
    <tbody>
      ${datos.embudo.pasos.map((paso) => `<tr><td>${paso.etapa}</td><td>${paso.total}</td><td>${formatoPct(paso.caidaPct)}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2>Rendimiento por canal</h2>
  <table>
    <thead><tr><th>Campaña</th><th>Red social</th><th>Moneda</th><th>Gasto</th><th>Clics</th><th>Leads</th><th>Ventas</th><th>CPC</th><th>CPL</th><th>CAC</th></tr></thead>
    <tbody>${filasCampania}</tbody>
  </table>

  ${seccionAsesor}
</body>
</html>`;
}

/**
 * Chromium headless server-side (docs/blocks/e-dashboards.md, "el
 * solicitante no necesita nada instalado"). `--no-sandbox`/
 * `--disable-setuid-sandbox`: necesario para correr Puppeteer dentro del
 * contenedor Docker de este proyecto (sin `CAP_SYS_ADMIN`, patrón estándar de
 * Puppeteer en Docker) -- no es una relajación de seguridad del proceso host,
 * solo del propio sandbox interno de Chromium.
 */
export async function generarPdfReporte(datos: DatosReporte): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    // `page.setContent` solo acepta "domcontentloaded"/"load" en esta
    // version de Puppeteer -- "networkidle0" es valido para `page.goto`
    // (navegacion real), no para contenido inyectado directo. "load" es el
    // equivalente mas cercano para esperar a que se resuelvan los recursos
    // (imagenes/fuentes) del HTML servido inline.
    await page.setContent(renderHtml(datos), { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
