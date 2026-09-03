import type { Content } from "pdfmake";
// pdfmake 0.3.11 es un singleton (`module.exports = new pdfmake()`), NUNCA
// la clase `PdfPrinter` -- import default OBLIGATORIO. Un named import
// (`import { createPdf } from "pdfmake"`) compila con los tipos de
// `@types/pdfmake`, pero explota en runtime bajo ESM nativo con
// `SyntaxError: Named export 'createPdf' not found` (probado empíricamente,
// ver `dreamy-painting-sketch.md`) -- Node no puede sintetizar named exports
// de un paquete CJS que exporta una única instancia.
import pdfmake from "pdfmake";
import { logger } from "../../lib/logger.js";
import type { DatosReporte } from "./tipos.js";

// Sin archivos .ttf: las 4 fuentes estándar de PDF, reconocidas por pdfkit
// (motor interno de pdfmake) por nombre, sin leer ningún archivo del disco.
pdfmake.setFonts({
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
});

// Nunca dejar que pdfmake pida URLs remotas por su cuenta -- el logo se
// pre-descarga e inyecta como `data:` URI (`resolverLogoDataUrl`), acá solo
// se cierra esa puerta explícitamente.
//
// NO se agrega acá un `setLocalAccessPolicy(() => false)` análogo (se probó
// y se revirtió): pdfkit resuelve los 4 nombres de fuente estándar
// (`Helvetica`/`Helvetica-Bold`/...) por el MISMO camino interno que
// `validateLocalFile`, así que negar todo acceso "local" rompe la carga de
// fuente por nombre y el PDF nunca se genera. El warning
// "No local access policy defined" que pdfmake imprime sin esta llamada es
// inofensivo (no es un error, no aborta la generación) -- se acepta tal cual.
pdfmake.setUrlAccessPolicy(() => false);

const TIPOS_IMAGEN_SOPORTADOS = new Set(["image/png", "image/jpeg"]);
const TIMEOUT_LOGO_MS = 5000;

function formatoPct(valor: number | null): string {
  return valor === null ? "—" : `${valor.toFixed(2)}%`;
}

function formatoCosto(valor: number | null, moneda: string): string {
  return valor === null ? "—" : `${moneda} ${valor.toFixed(2)}`;
}

/**
 * `logoUrl` ya es una URL pública de Azure Blob (`access: "blob"`, ver
 * `azure-blob-storage.ts::uploadImage`), así que se puede `fetch()` directo
 * sin SAS. pdfkit solo soporta PNG/JPEG nativamente (no WEBP ni SVG, aunque
 * el endpoint de upload de logos sí los acepta) -- limitación conocida y
 * aceptada, no se resuelve acá con conversión.
 *
 * Degradación total: cualquier falla (fetch rechazado, timeout, `!res.ok`,
 * content-type no soportado) devuelve `null` y solo loggea un warning --
 * NUNCA lanza. Mismo criterio de degradación que
 * `reporte-generacion.job.ts::generarArchivo` aplica a `getPorAsesor` (D6,
 * 403 -> `null`): la generación del PDF se completa igual, sin logo.
 */
export async function resolverLogoDataUrl(logoUrl: string | null): Promise<string | null> {
  if (logoUrl === null) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_LOGO_MS);

  try {
    const res = await fetch(logoUrl, { signal: controller.signal });
    if (!res.ok) {
      logger.warn({ logoUrl, status: res.status }, "reportes: no se pudo embeber el logo, se omite");
      return null;
    }

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    if (contentType === undefined || !TIPOS_IMAGEN_SOPORTADOS.has(contentType)) {
      logger.warn({ logoUrl, contentType }, "reportes: no se pudo embeber el logo, se omite");
      return null;
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch (err) {
    logger.warn({ err, logoUrl }, "reportes: no se pudo embeber el logo, se omite");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function encabezado(texto: string, colorSecundario: string): Content {
  return { text: texto, bold: true, color: "#FFFFFF", fillColor: colorSecundario, fontSize: 9 };
}

function celda(texto: string): Content {
  return { text: texto, fontSize: 9 };
}

function tituloSeccion(texto: string): Content {
  return { text: texto, style: "sectionHeader" };
}

function seccionPortada(datos: DatosReporte, logoDataUrl: string | null): Content[] {
  const generadoEn = new Date().toLocaleString("es-AR", { timeZone: "UTC" });
  const alcance = datos.empresaId === null ? "Holding (todas las empresas)" : datos.marca.nombre;

  const contenido: Content[] = [];
  if (logoDataUrl !== null) {
    contenido.push({ image: logoDataUrl, width: 120, alignment: "center", margin: [0, 0, 0, 20] });
  }
  contenido.push(
    { text: "Reporte de embudo de leads", fontSize: 26, bold: true, color: datos.marca.colorPrimario, alignment: "center" },
    { text: alcance, fontSize: 12, alignment: "center", margin: [0, 12, 0, 0] },
    { text: `Generado el ${generadoEn} UTC`, fontSize: 10, alignment: "center", margin: [0, 4, 0, 0] },
  );

  return [
    { stack: contenido, margin: [0, 200, 0, 0] },
    { text: "", pageBreak: "after" },
  ];
}

function seccionResumen(datos: DatosReporte): Content[] {
  const { resumen } = datos;
  const colorSecundario = datos.marca.colorSecundario;

  return [
    tituloSeccion("Resumen ejecutivo"),
    {
      table: {
        headerRows: 1,
        widths: ["*", "auto", "auto"],
        body: [
          [encabezado("Indicador", colorSecundario), encabezado("Actual", colorSecundario), encabezado("Anterior", colorSecundario)],
          [celda("Total ingresados"), celda(String(resumen.totalIngresados.actual)), celda(String(resumen.totalIngresados.anterior))],
          [celda("En gestión"), celda(String(resumen.enGestion.actual)), celda(String(resumen.enGestion.anterior))],
          [celda("Cerrados (venta)"), celda(String(resumen.cerrados.venta.actual)), celda(String(resumen.cerrados.venta.anterior))],
          [celda("Cerrados (no venta)"), celda(String(resumen.cerrados.noVenta.actual)), celda(String(resumen.cerrados.noVenta.anterior))],
          [
            celda("Tasa de conversión"),
            celda(formatoPct(resumen.tasaConversion.actual.porcentaje)),
            celda(formatoPct(resumen.tasaConversion.anterior.porcentaje)),
          ],
        ],
      },
    },
  ];
}

function seccionEmbudo(datos: DatosReporte): Content[] {
  const colorSecundario = datos.marca.colorSecundario;

  return [
    tituloSeccion("Embudo"),
    {
      table: {
        headerRows: 1,
        widths: ["*", "auto", "auto"],
        body: [
          [encabezado("Etapa", colorSecundario), encabezado("Total", colorSecundario), encabezado("Caída", colorSecundario)],
          ...datos.embudo.pasos.map((paso) => [celda(paso.etapa), celda(String(paso.total)), celda(formatoPct(paso.caidaPct))]),
        ],
      },
    },
  ];
}

function seccionCanal(datos: DatosReporte): Content[] {
  const colorSecundario = datos.marca.colorSecundario;

  return [
    tituloSeccion("Rendimiento por canal"),
    {
      table: {
        headerRows: 1,
        widths: ["*", "auto", "auto", "auto", "auto", "auto", "auto", "auto", "auto", "auto"],
        body: [
          [
            encabezado("Campaña", colorSecundario),
            encabezado("Red social", colorSecundario),
            encabezado("Moneda", colorSecundario),
            encabezado("Gasto", colorSecundario),
            encabezado("Clics", colorSecundario),
            encabezado("Leads", colorSecundario),
            encabezado("Ventas", colorSecundario),
            encabezado("CPC", colorSecundario),
            encabezado("CPL", colorSecundario),
            encabezado("CAC", colorSecundario),
          ],
          ...datos.rendimientoCampanias.map((fila) => [
            celda(fila.nombreCampania),
            celda(fila.redSocial),
            celda(fila.moneda),
            celda(fila.gasto.toFixed(2)),
            celda(String(fila.clics)),
            celda(String(fila.leads)),
            celda(String(fila.ventas)),
            celda(formatoCosto(fila.cpc, fila.moneda)),
            celda(formatoCosto(fila.cpl, fila.moneda)),
            celda(formatoCosto(fila.cac, fila.moneda)),
          ]),
        ],
      },
      fontSize: 8,
    },
  ];
}

function seccionAsesor(datos: DatosReporte): Content[] {
  if (datos.porAsesor === null) {
    return [tituloSeccion("Rendimiento por asesor"), { text: "No disponible para el rol del solicitante." }];
  }

  const colorSecundario = datos.marca.colorSecundario;

  return [
    tituloSeccion("Rendimiento por asesor"),
    {
      table: {
        headerRows: 1,
        widths: ["*", "auto", "auto", "auto", "auto", "auto"],
        body: [
          [
            encabezado("Asesor", colorSecundario),
            encabezado("Total", colorSecundario),
            encabezado("Ventas", colorSecundario),
            encabezado("No ventas", colorSecundario),
            encabezado("Conversión", colorSecundario),
            encabezado("SLA", colorSecundario),
          ],
          ...datos.porAsesor.map((fila) => [
            celda(fila.nombre),
            celda(String(fila.total)),
            celda(String(fila.ventas)),
            celda(String(fila.noVentas)),
            celda(formatoPct(fila.tasaConversionPct)),
            celda(formatoPct(fila.cumplimientoSlaPct)),
          ]),
        ],
      },
    },
  ];
}

/**
 * `TDocumentDefinitions` no está exportado por nombre desde `"pdfmake"` --
 * no se importa por nombre acá. El objeto se arma estructuralmente contra lo
 * que espera `pdfmake.createPdf`, con cada sección tipada como `Content[]`
 * (ese sí exportado).
 */
function construirDocDefinition(datos: DatosReporte, logoDataUrl: string | null) {
  const content: Content[] = [
    ...seccionPortada(datos, logoDataUrl),
    ...seccionResumen(datos),
    ...seccionEmbudo(datos),
    ...seccionCanal(datos),
    ...seccionAsesor(datos),
  ];

  return {
    pageSize: "A4" as const,
    pageMargins: [40, 40, 40, 40] as [number, number, number, number],
    defaultStyle: { font: "Helvetica", fontSize: 10 },
    styles: {
      sectionHeader: { fontSize: 14, bold: true, margin: [0, 16, 0, 6] as [number, number, number, number] },
    },
    content,
  };
}

/**
 * reportes (Bloque E, docs/blocks/e-dashboards.md "Exportación PDF/XLSX"):
 * estructura exacta del documento -- portada -> resumen ejecutivo -> embudo
 * -> rendimiento por canal (CPC/CPL/CAC) -> rendimiento por asesor (D6).
 *
 * Migrado de Puppeteer/Chromium (decisión 2026-08-31) a `pdfmake`: JS puro
 * (basado en pdfkit), sin binario nativo ni script de postinstall -- la
 * imagen de producción del backend nunca descargaba el binario de Chrome
 * (bug de allowlist de postinstall en `pnpm-workspace.yaml`/pnpm 11), así
 * que todo intento de generar un PDF fallaba en caliente con "Could not
 * find Chrome". Misma firma `Promise<Buffer>` de siempre --
 * `reporte-generacion.job.ts` no cambia.
 */
export async function generarPdfReporte(datos: DatosReporte): Promise<Buffer> {
  const logoDataUrl = await resolverLogoDataUrl(datos.marca.logoUrl);
  const docDefinition = construirDocDefinition(datos, logoDataUrl);
  return pdfmake.createPdf(docDefinition).getBuffer();
}
