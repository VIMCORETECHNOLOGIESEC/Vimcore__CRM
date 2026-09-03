/**
 * reportes (Bloque E, descarga con nombre legible, 2026-09-03): construye el
 * nombre de archivo que ve el usuario al descargar un reporte PDF/XLSX --
 * `<NOMBRE_MARCA>_ddmmaaaa_hhmm.<ext>` -- separado de `reporte-marca.ts`
 * (resuelve el branding) y de `azure-blob-storage.ts` (nombra el BLOB, un
 * uuid opaco que nunca cambia). Función pura, sin I/O, para poder testear la
 * sanitización/formateo de forma aislada.
 */

const FALLBACK_NOMBRE = "REPORTE";

/**
 * Mayúsculas, sin tildes/diacríticos (`normalize("NFD")` + strip del rango
 * de marcas combinantes), y cualquier secuencia de caracteres que no sea
 * `[A-Z0-9]` colapsada a un único `_` (un solo `replace` con un cuantificador
 * `+` ya cubre "colapsar `_` repetidos", no hace falta un segundo paso).
 * Recorta `_` sobrantes al principio/final. Si el resultado queda vacío
 * (nombre compuesto solo por símbolos/emoji), cae a `FALLBACK_NOMBRE`.
 */
function sanitizarNombreMarca(nombreMarca: string): string {
  const sinDiacriticos = nombreMarca.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const normalizado = sinDiacriticos
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalizado.length > 0 ? normalizado : FALLBACK_NOMBRE;
}

function pad2(valor: number): string {
  return String(valor).padStart(2, "0");
}

/**
 * UTC explícito -- mismo criterio que `lib/rango-fechas.ts` (que documenta
 * por qué evita depender de la hora local del proceso Node).
 */
function formatearFechaHoraUTC(fecha: Date): { ddmmaaaa: string; hhmm: string } {
  const dia = pad2(fecha.getUTCDate());
  const mes = pad2(fecha.getUTCMonth() + 1);
  const anio = String(fecha.getUTCFullYear()).padStart(4, "0");
  const horas = pad2(fecha.getUTCHours());
  const minutos = pad2(fecha.getUTCMinutes());
  return { ddmmaaaa: `${dia}${mes}${anio}`, hhmm: `${horas}${minutos}` };
}

export function construirNombreArchivoReporte(
  nombreMarca: string,
  fecha: Date,
  extension: "pdf" | "xlsx",
): string {
  const nombreSanitizado = sanitizarNombreMarca(nombreMarca);
  const { ddmmaaaa, hhmm } = formatearFechaHoraUTC(fecha);
  return `${nombreSanitizado}_${ddmmaaaa}_${hhmm}.${extension}`;
}
