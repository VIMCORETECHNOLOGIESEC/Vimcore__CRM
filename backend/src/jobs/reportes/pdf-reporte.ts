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
    { text: "Plantilla: Detallado", fontSize: 8, color: "#94A3B8", alignment: "center", margin: [0, 10, 0, 0] },
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

// ---------------------------------------------------------------------------
// pdf-ejecutivo: plantilla ALTERNATIVA y ADITIVA -- todo lo de arriba
// (`construirDocDefinition`/`seccion*` del "detallado") queda intacto y
// sigue siendo el default (`DatosReporte.plantilla === "detallado"`).
// `generarPdfReporte` (al final de este archivo) decide cuál renderer llamar
// según ese campo, ya resuelto por `reporte-generacion.job.ts` a partir de
// `parametros.plantilla` (`reporteParametrosSchema`, default "detallado").
//
// Sin fuente custom embebida (`defaultStyle: { font: "Helvetica" }`, decisión
// explícita v1, igual que el "detallado") y sin librería de gráficos/canvas
// server-side nueva -- todo lo visual (franjas, barras, semáforo apilado) es
// `canvas` nativo de pdfmake (motor pdfkit).
// ---------------------------------------------------------------------------

const A4_ANCHO = 595.28;
const A4_ALTO = 841.89;

/**
 * `@types/pdfmake` define `Column = Content & ColumnProperties` en
 * `interfaces.d.ts` (`width?: Size`), pero NO lo re-exporta desde el paquete
 * `"pdfmake"` en sí (`index.d.ts` solo exporta `Content`, `Table`,
 * `TableCell`, etc.) -- se redeclara acá localmente en vez de importarlo,
 * exactamente con la misma forma, para poder tipar el retorno de funciones
 * que arman una entrada de `columns` con ancho fijo (`marcaMarcaColumna`)
 * sin que el chequeo de propiedades excedentes de TS rechace `width` contra
 * el tipo `Content` "pelado" (que no lo tiene en la variante `ContentStack`).
 */
type ColumnaAncha = Content & { width?: string | number };

// Colores del semáforo: FIJOS y reservados, nunca `colorPrimario`/
// `colorSecundario` de marca (a diferencia de todo lo demás en esta
// plantilla, que SIEMPRE usa `datos.marca.*` -- nunca un color hardcodeado
// de una empresa puntual). Mismos 4 valores ya establecidos en el proyecto
// para el semáforo de leads (frontend, `docs/09-linea-grafica-frontend.md`).
const SEMAFORO_VERDE = "#16A34A";
const SEMAFORO_AMBAR = "#D97706";
const SEMAFORO_ROJO = "#DC2626";
const SEMAFORO_GRIS = "#94A3B8";

function formatoFechaCorta(fecha: Date): string {
  return fecha.toLocaleDateString("es-AR", { timeZone: "UTC" });
}

function formatoRangoEjecutivo(datos: DatosReporte): string {
  const { desde, hasta } = datos.resumen.rango;
  return `${formatoFechaCorta(desde)} – ${formatoFechaCorta(hasta)}`;
}

/**
 * Logo real (SI `logoDataUrl !== null`) o fallback a un cuadrado
 * `colorPrimario` con la primera letra de `nombre` en `colorSecundario`
 * (canvas rect + texto superpuesto vía `relativePosition`) -- nunca un
 * ícono genérico, mismo criterio que ya sigue `resolverLogoDataUrl` de no
 * inventar un logo que no existe. Devuelve contenido SIN ancho propio salvo
 * en el caso de imagen real (`width` en el nodo `image`) -- quien lo use
 * dentro de `columns` debe envolverlo con `{ width: size, ... }` para que
 * el motor de layout no lo estire a lo ancho del contenedor (necesario para
 * que el texto superpuesto del fallback quede centrado sobre el cuadrado).
 */
type MarcaMarcaContenido = { image: string; width: number } | { stack: Content[] };

function marcaMarcaContenido(
  nombre: string,
  colorPrimario: string,
  colorSecundario: string,
  logoDataUrl: string | null,
  size: number,
): MarcaMarcaContenido {
  if (logoDataUrl !== null) {
    return { image: logoDataUrl, width: size };
  }

  const letra = (nombre.trim().charAt(0) || "?").toUpperCase();
  return {
    stack: [
      { canvas: [{ type: "rect", x: 0, y: 0, w: size, h: size, color: colorPrimario }] },
      {
        text: letra,
        color: colorSecundario,
        bold: true,
        fontSize: Math.round(size * 0.5),
        alignment: "center",
        relativePosition: { x: 0, y: -Math.round(size * 0.78) },
      },
    ],
  };
}

function marcaMarcaColumna(
  nombre: string,
  colorPrimario: string,
  colorSecundario: string,
  logoDataUrl: string | null,
  size: number,
): ColumnaAncha {
  return { width: size, ...marcaMarcaContenido(nombre, colorPrimario, colorSecundario, logoDataUrl, size) };
}

/**
 * Página 1 -- "terrazas del embudo": 4 franjas verticales apiladas,
 * ancho decreciente hacia abajo, alineadas al borde derecho de la página
 * (A4 = 595.28 × 841.89pt), ignorando el margen de 40pt del documento SOLO
 * para estos rects (`absolutePosition`). Traducción directa de un mock ya
 * aprobado -- las proporciones (42%/54.76%/67.52%/79.12% del ancho de
 * página) no son arbitrarias, no reinterpretar.
 */
function franjasPortada(colorPrimario: string, colorSecundario: string): Content {
  const franjas = [
    { xPct: 0.42, color: colorSecundario, fillOpacity: 1 },
    { xPct: 0.5476, color: colorPrimario, fillOpacity: 1 },
    { xPct: 0.6752, color: colorSecundario, fillOpacity: 0.55 },
    { xPct: 0.7912, color: colorPrimario, fillOpacity: 0.85 },
  ];
  const alturaFranja = A4_ALTO / franjas.length;

  return {
    canvas: franjas.map((f, i) => ({
      type: "rect" as const,
      x: A4_ANCHO * f.xPct,
      y: i * alturaFranja,
      w: A4_ANCHO * (1 - f.xPct),
      h: alturaFranja,
      color: f.color,
      fillOpacity: f.fillOpacity,
    })),
    absolutePosition: { x: 0, y: 0 },
  };
}

function seccionPortadaEjecutiva(datos: DatosReporte, logoDataUrl: string | null): Content[] {
  const generadoEn = new Date().toLocaleString("es-AR", { timeZone: "UTC" });
  const { colorPrimario, colorSecundario, nombre } = datos.marca;
  const alcance = datos.empresaId === null ? "Holding · todas las empresas" : "Vista de empresa";

  return [
    franjasPortada(colorPrimario, colorSecundario),
    {
      columns: [marcaMarcaColumna(nombre, colorPrimario, colorSecundario, logoDataUrl, 32)],
      margin: [0, 0, 0, 8],
    },
    { text: nombre, bold: true, fontSize: 13, color: colorPrimario },
    { text: alcance, fontSize: 9, color: "#64748B", margin: [0, 2, 0, 0] },
    {
      stack: [
        { text: "INFORME EJECUTIVO", fontSize: 10, bold: true, color: colorSecundario },
        { text: "Resumen de\nembudo de ventas", fontSize: 30, bold: true, color: colorPrimario, margin: [0, 8, 0, 14] },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 140, y2: 0, lineWidth: 2, lineColor: colorSecundario }] },
      ],
      margin: [0, 230, 0, 0],
    },
    {
      stack: [
        { text: `Período: ${formatoRangoEjecutivo(datos)}`, fontSize: 9, color: "#334155" },
        { text: `Generado el: ${generadoEn} UTC`, fontSize: 9, color: "#334155", margin: [0, 2, 0, 0] },
        { text: "Plantilla: Ejecutivo", fontSize: 8, color: "#94A3B8", margin: [0, 6, 0, 0] },
      ],
      absolutePosition: { x: 40, y: A4_ALTO - 110 },
    },
    { text: "", pageBreak: "after" },
  ];
}

function tituloSeccionEjecutiva(texto: string, colorPrimario: string): Content {
  return { text: texto, fontSize: 13, bold: true, color: colorPrimario, margin: [0, 14, 0, 6] };
}

function letterheadEjecutivo(datos: DatosReporte, logoDataUrl: string | null): Content[] {
  const { colorPrimario, colorSecundario, nombre } = datos.marca;

  return [
    {
      columns: [
        marcaMarcaColumna(nombre, colorPrimario, colorSecundario, logoDataUrl, 20),
        { width: "*", text: nombre, bold: true, fontSize: 10, color: colorPrimario, margin: [8, 3, 0, 0] },
      ],
      columnGap: 4,
    },
    { text: "Resumen de embudo de ventas", fontSize: 18, bold: true, color: colorPrimario, margin: [0, 10, 0, 2] },
    { text: `Período: ${formatoRangoEjecutivo(datos)}`, fontSize: 9, color: "#64748B", margin: [0, 0, 0, 4] },
  ];
}

function deltaTextoEjecutivo(variacion: number | null): string {
  if (variacion === null) return "—";
  const signo = variacion > 0 ? "+" : "";
  return `${signo}${variacion.toFixed(1)}%`;
}

/**
 * `subeEsFavorable`: para todos los KPI salvo "tiempo promedio de cierre",
 * subir es favorable (verde). Para tiempo de cierre es al revés -- bajar
 * (cerrar más rápido) es lo favorable, así que ese KPI se llama con `false`.
 */
function deltaColorEjecutivo(variacion: number | null, subeEsFavorable: boolean): string {
  if (variacion === null || variacion === 0) return "#64748B";
  const favorable = subeEsFavorable ? variacion > 0 : variacion < 0;
  return favorable ? "#16A34A" : "#DC2626";
}

/**
 * Tipo de retorno propio, no `Content` -- `Content` es una unión de
 * pdfmake que incluye `string` (shorthand de `{ text }`), así que TS
 * rechaza el spread (`...tarjeta`) en `filaKpis` con "Spread types may
 * only be created from object types" (TS2698) si se tipa como `Content`
 * a secas. Mismo criterio que `MarcaMarcaContenido` para
 * `marcaMarcaColumna` más arriba.
 */
type TarjetaKpiContenido = { fillColor: string; stack: Content[] };

function tarjetaKpi(
  colWidth: number,
  label: string,
  valor: string,
  variacion: number | null,
  subeEsFavorable: boolean,
  colorPrimario: string,
  colorSecundario: string,
): TarjetaKpiContenido {
  return {
    fillColor: "#F8FAFC",
    stack: [
      {
        canvas: [
          {
            type: "polyline",
            points: [
              { x: colWidth - 18, y: 0 },
              { x: colWidth - 4, y: 0 },
              { x: colWidth - 4, y: 12 },
            ],
            color: colorSecundario,
            closePath: true,
          },
        ],
      },
      { text: label, fontSize: 8, color: "#64748B", margin: [8, 2, 8, 2] },
      { text: valor, fontSize: 17, bold: true, color: colorPrimario, margin: [8, 0, 8, 2] },
      { text: deltaTextoEjecutivo(variacion), fontSize: 8, bold: true, color: deltaColorEjecutivo(variacion, subeEsFavorable), margin: [8, 0, 8, 6] },
    ],
  };
}

/**
 * `columns`, no `table`: un `table` de pdfmake agrega padding por celda
 * incluso con `layout: "noBorders"` (los `paddingLeft/Right` del layout por
 * defecto no quedan en cero solo por sacar los bordes) -- con 4 columnas de
 * 121pt + 3 gaps de 10pt (514pt, el ancho original) contra un área de
 * contenido de 515.28pt (A4 menos márgenes de 40pt), ese padding extra
 * alcanzaba para desbordar la última tarjeta fuera de la página (visto en
 * producción, PDF real). Un `columns` no tiene ese padding implícito, así
 * que el mismo ancho fijo por tarjeta queda seguro; se bajó igual a 120pt
 * (480pt + 30pt de gaps = 510pt) para dejar un margen de seguridad real.
 */
function filaKpis(datos: DatosReporte): Content {
  const { colorPrimario, colorSecundario } = datos.marca;
  const { totalIngresados, tasaConversion, cumplimientoSla, tiempoPromedioCierre } = datos.resumen;
  const colWidth = 120;

  const tiempoCierreValor = tiempoPromedioCierre.diasPromedio === null ? "—" : `${tiempoPromedioCierre.diasPromedio.toFixed(1)} d`;

  const tarjetas = [
    tarjetaKpi(colWidth, "Total ingresados", String(totalIngresados.actual), totalIngresados.variacionPorcentual, true, colorPrimario, colorSecundario),
    tarjetaKpi(colWidth, "Tasa de conversión", formatoPct(tasaConversion.actual.porcentaje), tasaConversion.variacionPorcentual, true, colorPrimario, colorSecundario),
    tarjetaKpi(colWidth, "Cumplimiento SLA", formatoPct(cumplimientoSla.porcentaje), cumplimientoSla.variacionPorcentual, true, colorPrimario, colorSecundario),
    tarjetaKpi(colWidth, "Tiempo prom. de cierre", tiempoCierreValor, tiempoPromedioCierre.variacionPorcentual, false, colorPrimario, colorSecundario),
  ];

  return {
    columns: tarjetas.map((tarjeta) => ({ width: colWidth, ...tarjeta }) as ColumnaAncha),
    columnGap: 10,
    margin: [0, 8, 0, 16],
  };
}

const EMBUDO_BAR_MAX_W = 280;

/**
 * Embudo en barras horizontales: color `colorPrimario` con `fillOpacity`
 * creciente hacia el final del embudo, EXCEPTO el último paso ("Venta"),
 * que va en `colorSecundario` sólido para destacarlo como el objetivo.
 * Generalizado a cualquier cantidad de pasos (el fixture de test más simple
 * usa solo 2) -- nunca asume exactamente 4/5 etapas.
 */
function seccionEmbudoBarras(datos: DatosReporte): Content[] {
  const { colorPrimario, colorSecundario } = datos.marca;
  const pasos = datos.embudo.pasos;
  const n = pasos.length;
  const maxTotal = pasos.reduce((max, p) => Math.max(max, p.total), 0);

  const filas: Content[] = pasos.flatMap((paso, i) => {
    const esUltimo = i === n - 1;
    const color = esUltimo ? colorSecundario : colorPrimario;
    const fillOpacity = esUltimo ? 1 : n <= 1 ? 1 : 0.35 + (i / Math.max(n - 1, 1)) * 0.4;
    const anchoBarra = maxTotal === 0 ? 0 : Math.round((paso.total / maxTotal) * EMBUDO_BAR_MAX_W);

    const fila: Content = {
      columns: [
        { width: 100, text: paso.etapa, fontSize: 9 },
        { width: EMBUDO_BAR_MAX_W, canvas: anchoBarra > 0 ? [{ type: "rect", x: 0, y: 0, w: anchoBarra, h: 14, color, fillOpacity }] : [] },
        { width: "*", text: String(paso.total), fontSize: 9, alignment: "right" },
      ],
      columnGap: 8,
      margin: [0, 0, 0, 2],
    };

    const caida: Content = {
      text: paso.caidaPct === null ? "" : `Caída: ${paso.caidaPct.toFixed(1)}%`,
      fontSize: 7,
      color: "#94A3B8",
      margin: [108, 0, 0, 8],
    };

    return [fila, caida];
  });

  return [tituloSeccionEjecutiva("Embudo", colorPrimario), ...filas];
}

function top5PorLeads(rendimientoCampanias: DatosReporte["rendimientoCampanias"]): DatosReporte["rendimientoCampanias"] {
  return [...rendimientoCampanias].sort((a, b) => b.leads - a.leads).slice(0, 5);
}

function tablaCanales(datos: DatosReporte): Content {
  const colorSecundario = datos.marca.colorSecundario;
  const filas = top5PorLeads(datos.rendimientoCampanias);

  return {
    table: {
      headerRows: 1,
      widths: ["*", "auto", "auto", "auto"],
      body: [
        [encabezado("Canal", colorSecundario), encabezado("Leads", colorSecundario), encabezado("Ventas", colorSecundario), encabezado("CAC", colorSecundario)],
        ...(filas.length === 0
          ? [[{ text: "Sin datos de campañas para este período.", colSpan: 4, italics: true, color: "#94A3B8" }, {}, {}, {}]]
          : filas.map((fila) => [
              celda(fila.nombreCampania),
              celda(String(fila.leads)),
              celda(String(fila.ventas)),
              celda(formatoCosto(fila.cac, fila.moneda)),
            ])),
      ],
    },
    // Layout propio, no el grid con línea completa por defecto de pdfmake
    // (fuera de lugar en esta plantilla, todo lo demás en "ejecutivo" es
    // borderless -- el grid default solo tenía sentido en "detallado", que
    // reusa `encabezado()`/`celda()` tal cual sin tocar su layout). Solo
    // hairlines finas ENTRE filas de datos, nunca verticales, nada bajo el
    // encabezado (su propio fondo de color ya lo separa) ni bajo la última
    // fila.
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i > 1 && i < node.table.body.length ? 0.5 : 0),
      vLineWidth: () => 0,
      hLineColor: () => "#E2E8F0",
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    fontSize: 8,
  };
}

/**
 * Semáforo como barra apilada horizontal (un solo `canvas` con hasta 4
 * segmentos) + leyenda con swatch+etiqueta+% para cada segmento (nunca solo
 * color, criterio de accesibilidad ya establecido en el proyecto). Guarda
 * contra total=0 (sin leads "en gestión" en el período): sin eso, dividir
 * por el total produce NaN/Infinity y pdfkit revienta al dibujar el rect.
 */
function barraSemaforo(datos: DatosReporte): Content[] {
  const { rojo, amarillo, verde, sinCalificar } = datos.resumen.distribucionSemaforo;
  const total = rojo + amarillo + verde + sinCalificar;
  const anchoTotal = 200;

  const segmentos = [
    { valor: verde, color: SEMAFORO_VERDE, etiqueta: "Verde" },
    { valor: amarillo, color: SEMAFORO_AMBAR, etiqueta: "Ámbar" },
    { valor: rojo, color: SEMAFORO_ROJO, etiqueta: "Rojo" },
    { valor: sinCalificar, color: SEMAFORO_GRIS, etiqueta: "Sin calificar" },
  ];

  const rects: { type: "rect"; x: number; y: number; w: number; h: number; color: string }[] = [];
  let cursor = 0;
  if (total > 0) {
    for (const s of segmentos) {
      if (s.valor === 0) continue;
      const w = (s.valor / total) * anchoTotal;
      rects.push({ type: "rect", x: cursor, y: 0, w, h: 16, color: s.color });
      cursor += w;
    }
  }

  const barra: Content = {
    canvas: rects.length > 0 ? rects : [{ type: "rect", x: 0, y: 0, w: anchoTotal, h: 16, color: "#E2E8F0" }],
  };

  const leyenda: Content[] = segmentos.map((s) => ({
    columns: [
      { width: 8, canvas: [{ type: "rect", x: 0, y: 2, w: 8, h: 8, color: s.color }] },
      { width: "*", text: `${s.etiqueta}: ${total === 0 ? "—" : `${((s.valor / total) * 100).toFixed(0)}%`}`, fontSize: 8, margin: [4, 0, 0, 0] },
    ],
    margin: [0, 3, 0, 0],
  }));

  return [barra, ...leyenda];
}

function seccionDesglose(datos: DatosReporte): Content[] {
  const colorPrimario = datos.marca.colorPrimario;

  return [
    tituloSeccionEjecutiva("Desglose por canal y calificación", colorPrimario),
    {
      columns: [
        { width: 300, stack: [tablaCanales(datos)] },
        { width: "*", stack: [{ text: "Semáforo (leads en gestión)", fontSize: 9, bold: true, margin: [0, 0, 0, 6] }, ...barraSemaforo(datos)] },
      ],
      columnGap: 16,
    },
  ];
}

/**
 * Conclusiones: template DETERMINÍSTICO (sin IA) a partir de datos reales
 * -- nunca inventa nada que no esté en `datos`.
 */
function tendenciaFraseEjecutiva(sujeto: string, variacion: number | null): string {
  if (variacion === null) return `${sujeto} no tiene comparación suficiente frente al período anterior.`;
  const direccion = variacion >= 0 ? "subió" : "bajó";
  return `${sujeto} ${direccion} ${Math.abs(variacion).toFixed(1)}% frente al período anterior.`;
}

function mayorCaidaFraseEjecutiva(pasos: DatosReporte["embudo"]["pasos"]): string {
  const conCaida = pasos.filter((p): p is typeof p & { caidaPct: number } => p.caidaPct !== null);
  if (conCaida.length === 0) {
    return "No se registran caídas significativas entre etapas del embudo en este período.";
  }
  const peor = conCaida.reduce((max, p) => (p.caidaPct > max.caidaPct ? p : max));
  // Guion ASCII normal, nunca el signo menos Unicode (U+2212): Helvetica
  // estándar de pdfmake solo soporta WinAnsi/CP1252, que no incluye ese
  // glifo -- se renderiza como un caracter roto (visto en producción).
  return `La mayor fuga del embudo está en el paso ${peor.etapa} (-${peor.caidaPct.toFixed(1)}%).`;
}

function seccionConclusiones(datos: DatosReporte): Content[] {
  const { colorPrimario, colorSecundario } = datos.marca;
  const texto = [
    tendenciaFraseEjecutiva("La conversión general", datos.resumen.tasaConversion.variacionPorcentual),
    tendenciaFraseEjecutiva("El cumplimiento de SLA", datos.resumen.cumplimientoSla.variacionPorcentual),
    mayorCaidaFraseEjecutiva(datos.embudo.pasos),
  ].join(" ");

  return [
    {
      table: {
        widths: ["*"],
        body: [
          [
            {
              stack: [
                { text: "Conclusiones", fontSize: 11, bold: true, color: colorPrimario, margin: [0, 0, 0, 4] },
                { text: texto, fontSize: 9, lineHeight: 1.3 },
              ],
              margin: [10, 10, 10, 10],
            },
          ],
        ],
      },
      layout: {
        hLineColor: () => colorSecundario,
        vLineColor: () => colorSecundario,
        hLineWidth: () => 1,
        vLineWidth: () => 1,
      },
      margin: [0, 16, 0, 8],
    },
  ];
}

function seccionCuerpoEjecutivo(datos: DatosReporte, logoDataUrl: string | null): Content[] {
  return [
    ...letterheadEjecutivo(datos, logoDataUrl),
    filaKpis(datos),
    ...seccionEmbudoBarras(datos),
    ...seccionDesglose(datos),
    ...seccionConclusiones(datos),
  ];
}

/**
 * Plantilla "ejecutivo" (pdf-ejecutivo, aditiva): portada "terrazas del
 * embudo" -> letterhead -> 4 KPIs -> embudo en barras -> desglose canal +
 * semáforo -> conclusiones -> footer con paginación. Nunca reusa
 * `construirDocDefinition`/estilos del "detallado" (ese objeto define su
 * propio `styles.sectionHeader`, no aplicable acá).
 */
function construirDocDefinitionEjecutivo(datos: DatosReporte, logoDataUrl: string | null) {
  const generadoEn = new Date().toLocaleString("es-AR", { timeZone: "UTC" });
  const content: Content[] = [...seccionPortadaEjecutiva(datos, logoDataUrl), ...seccionCuerpoEjecutivo(datos, logoDataUrl)];

  return {
    pageSize: "A4" as const,
    pageMargins: [40, 40, 40, 40] as [number, number, number, number],
    defaultStyle: { font: "Helvetica", fontSize: 10 },
    footer: (currentPage: number, pageCount: number): Content => ({
      columns: [
        { text: `Generado el ${generadoEn} UTC · Documento confidencial de uso interno`, fontSize: 7, color: "#94A3B8" },
        { text: `${currentPage} / ${pageCount}`, fontSize: 7, color: "#94A3B8", alignment: "right" },
      ],
      margin: [40, 0, 40, 20],
    }),
    content,
  };
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
  const docDefinition =
    datos.plantilla === "ejecutivo" ? construirDocDefinitionEjecutivo(datos, logoDataUrl) : construirDocDefinition(datos, logoDataUrl);
  return pdfmake.createPdf(docDefinition).getBuffer();
}
