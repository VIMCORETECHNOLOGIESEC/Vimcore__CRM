import * as XLSX from "xlsx";
import type { CargaMasivaLeadInput } from "./carga-masiva.api";

/**
 * Parseo/validación del Excel de carga masiva y descarga del template fijo
 * de columnas (backend real, ver el docblock de `carga-masiva.api.ts`).
 * Template fijo de columnas en vez de adivinar headers variables --
 * `CARGA_MASIVA_COLUMNAS` es la única fuente de verdad de esos headers, tanto
 * para generar el template (`descargarTemplateCargaMasiva`) como para leerlo
 * de vuelta (`parsearExcelCargaMasiva`).
 *
 * Columna `canalManualId` OPCIONAL: el contrato real
 * (`leads-manual.service.ts:141-147`) admite canal tanto a nivel de LOTE
 * (`CargaMasivaLeadsDialog.tsx`, un `<Select>` que aplica a todo el archivo)
 * como por FILA (esta columna, opcional, pisa el del lote solo para esa
 * fila puntual) -- ver `carga-masiva.api.ts`. La mayoría de los archivos no
 * necesita completarla (el canal de lote alcanza); queda disponible para el
 * caso de un archivo con leads de canales mixtos.
 */
export const CARGA_MASIVA_COLUMNAS = ["nombre", "telefono", "correo", "canalManualId"] as const;

interface FilaCrudaExcel {
  nombre?: unknown;
  telefono?: unknown;
  correo?: unknown;
  canalManualId?: unknown;
}

export interface FilaCargaMasivaParseada {
  /**
   * Número real de fila del archivo Excel (1-based, contando el encabezado
   * como fila 1 -- la primera fila de datos es la 2, igual que la ve el
   * usuario con Excel/Sheets abierto). Es la clave para mapear de vuelta el
   * `fila` (índice de array, 1-based) que devuelve `crearLeadsMasivoApi` al
   * número real que el usuario tiene que ir a corregir (ver
   * `useCargaMasiva.ts`).
   */
  filaExcel: number;
  nombre: string;
  telefono?: string;
  correo?: string;
  /** Override opcional del canal de lote, solo para esta fila -- ver `CARGA_MASIVA_COLUMNAS`. */
  canalManualId?: string;
  /** `true` si al backend (o a esta validación previa) le falta algo obligatorio -- ver `motivoInvalida`. */
  invalida: boolean;
  motivoInvalida?: string;
}

export interface ParseoExcelCargaMasiva {
  filas: FilaCargaMasivaParseada[];
  validas: FilaCargaMasivaParseada[];
  invalidas: FilaCargaMasivaParseada[];
}

function celdaTexto(valor: unknown): string | undefined {
  const texto = String(valor ?? "").trim();
  return texto.length > 0 ? texto : undefined;
}

/**
 * Parsea un Excel de carga masiva (`File` del `<input type="file">`, o un
 * `ArrayBuffer` ya leído -- útil en tests, ver `carga-masiva.utils.test.ts`)
 * contra el template fijo de columnas. Valida ANTES de mandar nada al
 * backend, mismo criterio que exige el contrato de Mateo (`carga-masiva.api.ts`):
 * - `nombre` requerido (contrato del lote, distinto del alta manual de un
 *   único lead donde `nombre` es opcional -- `canal-manual.api.ts`).
 * - Al menos uno de `telefono`/`correo` (deduplicación).
 */
export async function parsearExcelCargaMasiva(
  archivo: File | ArrayBuffer,
): Promise<ParseoExcelCargaMasiva> {
  const buffer = archivo instanceof ArrayBuffer ? archivo : await archivo.arrayBuffer();
  const libro = XLSX.read(buffer, { type: "array" });
  const primeraHoja = libro.SheetNames[0];
  const hoja = primeraHoja ? libro.Sheets[primeraHoja] : undefined;
  const filasCrudas = hoja ? XLSX.utils.sheet_to_json<FilaCrudaExcel>(hoja, { defval: "" }) : [];

  const filas: FilaCargaMasivaParseada[] = filasCrudas.map((cruda, indice) => {
    // +1 por el encabezado (fila 1), +1 porque `indice` es 0-based.
    const filaExcel = indice + 2;
    const nombre = celdaTexto(cruda.nombre);
    const telefono = celdaTexto(cruda.telefono);
    const correo = celdaTexto(cruda.correo);
    const canalManualId = celdaTexto(cruda.canalManualId);

    const motivos: string[] = [];
    if (!nombre) motivos.push("falta el nombre");
    if (!telefono && !correo) motivos.push("faltan teléfono y correo (se necesita al menos uno)");

    return {
      filaExcel,
      nombre: nombre ?? "",
      telefono,
      correo,
      canalManualId,
      invalida: motivos.length > 0,
      motivoInvalida: motivos.length > 0 ? capitalizar(motivos.join("; ")) : undefined,
    };
  });

  return {
    filas,
    validas: filas.filter((fila) => !fila.invalida),
    invalidas: filas.filter((fila) => fila.invalida),
  };
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1) + ".";
}

/** Convierte una fila ya parseada y validada al shape exacto que espera `CargaMasivaBody.leads`. */
export function filaParseadaALeadInput(fila: FilaCargaMasivaParseada): CargaMasivaLeadInput {
  return {
    nombre: fila.nombre,
    telefono: fila.telefono,
    correo: fila.correo,
    canalManualId: fila.canalManualId,
  };
}

/**
 * Dispara la descarga del template fijo de columnas (Mateo, ver el docblock
 * de arriba). Genera el `.xlsx` completo en memoria con `XLSX.write` (nunca
 * `XLSX.writeFile`: esa función detecta Node/`fs` y escribiría a disco bajo
 * Vitest/jsdom en vez de disparar una descarga de navegador) y reusa el
 * mismo mecanismo de descarga ya establecido en este bloque
 * (`dashboard/exportarDashboard.ts::descargarArchivo`,
 * `reportes/reportes.api.ts`): `Blob` + `URL.createObjectURL` + `<a download>` sintético.
 */
export function descargarTemplateCargaMasiva(): void {
  const libro = XLSX.utils.book_new();
  const hoja = XLSX.utils.aoa_to_sheet([[...CARGA_MASIVA_COLUMNAS]]);
  XLSX.utils.book_append_sheet(libro, hoja, "Leads");
  const buffer = XLSX.write(libro, { bookType: "xlsx", type: "array" }) as ArrayBuffer;

  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = "plantilla-carga-masiva-leads.xlsx";
  enlace.style.display = "none";
  document.body.appendChild(enlace);
  enlace.click();
  window.setTimeout(() => {
    enlace.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
