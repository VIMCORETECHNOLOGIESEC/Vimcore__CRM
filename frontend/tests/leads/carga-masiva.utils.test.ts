import * as XLSX from "xlsx";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CARGA_MASIVA_COLUMNAS,
  descargarTemplateCargaMasiva,
  filaParseadaALeadInput,
  parsearExcelCargaMasiva,
} from "@/funcionalidades/leads/carga-masiva.utils";

/**
 * `carga-masiva.utils.ts` -- lógica no trivial de parseo/validación de Excel
 * (AGENTS.md §5). Se construye un workbook de prueba en memoria con
 * `XLSX.utils` (la forma más realista de testear esto sin mockear `xlsx`
 * entero) y se lee de vuelta con la propia función bajo prueba.
 */

function workbookBuffer(filas: (string | number)[][]): ArrayBuffer {
  const libro = XLSX.utils.book_new();
  const hoja = XLSX.utils.aoa_to_sheet([[...CARGA_MASIVA_COLUMNAS], ...filas]);
  XLSX.utils.book_append_sheet(libro, hoja, "Leads");
  return XLSX.write(libro, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parsearExcelCargaMasiva — filas válidas", () => {
  it("parsea filas válidas con el número real de fila del Excel (encabezado = fila 1, primera fila de datos = fila 2)", async () => {
    const buffer = workbookBuffer([
      ["María Cabrera", "0991234567", "maria@correo.test", ""],
      ["Juan Pérez", "", "juan@correo.test", ""],
    ]);

    const resultado = await parsearExcelCargaMasiva(buffer);

    expect(resultado.filas).toHaveLength(2);
    expect(resultado.validas).toHaveLength(2);
    expect(resultado.invalidas).toHaveLength(0);
    expect(resultado.filas[0]).toMatchObject({
      filaExcel: 2,
      nombre: "María Cabrera",
      telefono: "0991234567",
      correo: "maria@correo.test",
      canalManualId: undefined,
      invalida: false,
    });
    expect(resultado.filas[1]).toMatchObject({
      filaExcel: 3,
      nombre: "Juan Pérez",
      telefono: undefined,
      correo: "juan@correo.test",
      invalida: false,
    });
  });

  it("acepta una fila con solo teléfono o solo correo (nunca exige ambos)", async () => {
    const buffer = workbookBuffer([
      ["Solo teléfono", "0991234567", ""],
      ["Solo correo", "", "solo@correo.test"],
    ]);

    const resultado = await parsearExcelCargaMasiva(buffer);

    expect(resultado.validas).toHaveLength(2);
  });

  it("lee la columna opcional `canalManualId` cuando la fila la trae (override del canal de lote)", async () => {
    const buffer = workbookBuffer([
      ["María Cabrera", "0991234567", "", "canal-fila-9"],
      ["Sin canal propio", "0991234568", "", ""],
    ]);

    const resultado = await parsearExcelCargaMasiva(buffer);

    expect(resultado.filas[0].canalManualId).toBe("canal-fila-9");
    expect(resultado.filas[1].canalManualId).toBeUndefined();
  });
});

describe("parsearExcelCargaMasiva — filas inválidas", () => {
  it("marca inválida una fila sin teléfono NI correo, con el número real de fila y motivo", async () => {
    const buffer = workbookBuffer([
      ["Sin contacto", "", ""],
      ["Con teléfono", "0991234567", ""],
    ]);

    const resultado = await parsearExcelCargaMasiva(buffer);

    expect(resultado.invalidas).toHaveLength(1);
    expect(resultado.invalidas[0].filaExcel).toBe(2);
    expect(resultado.invalidas[0].motivoInvalida).toMatch(/teléfono y correo/i);
    expect(resultado.validas).toHaveLength(1);
    expect(resultado.validas[0].filaExcel).toBe(3);
  });

  it("marca inválida una fila sin nombre (requerido por el contrato de carga masiva)", async () => {
    const buffer = workbookBuffer([["", "0991234567", ""]]);

    const resultado = await parsearExcelCargaMasiva(buffer);

    expect(resultado.invalidas).toHaveLength(1);
    expect(resultado.invalidas[0].motivoInvalida).toMatch(/nombre/i);
  });

  it("una fila sin nombre y sin contacto reporta ambos motivos", async () => {
    const buffer = workbookBuffer([["", "", ""]]);

    const resultado = await parsearExcelCargaMasiva(buffer);

    expect(resultado.invalidas[0].motivoInvalida).toMatch(/nombre/i);
    expect(resultado.invalidas[0].motivoInvalida).toMatch(/teléfono y correo/i);
  });

  it("un Excel sin filas de datos (solo encabezado) devuelve listas vacías, sin lanzar", async () => {
    const buffer = workbookBuffer([]);

    const resultado = await parsearExcelCargaMasiva(buffer);

    expect(resultado.filas).toEqual([]);
  });
});

describe("parsearExcelCargaMasiva — acepta un `File` real, no solo ArrayBuffer", () => {
  it("lee un `File` del navegador (equivalente a `<input type=\"file\">`)", async () => {
    const buffer = workbookBuffer([["Desde File", "0991234567", ""]]);
    const archivo = new File([buffer], "leads.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const resultado = await parsearExcelCargaMasiva(archivo);

    expect(resultado.validas).toHaveLength(1);
    expect(resultado.validas[0].nombre).toBe("Desde File");
  });
});

describe("filaParseadaALeadInput", () => {
  it("convierte una fila parseada al shape exacto de CargaMasivaLeadInput (sin canalManualId propio en la fila)", async () => {
    const buffer = workbookBuffer([["María Cabrera", "0991234567", "maria@correo.test"]]);
    const resultado = await parsearExcelCargaMasiva(buffer);

    expect(filaParseadaALeadInput(resultado.validas[0])).toEqual({
      nombre: "María Cabrera",
      telefono: "0991234567",
      correo: "maria@correo.test",
      canalManualId: undefined,
    });
  });

  it("incluye el canalManualId de fila cuando la fila lo trae (override del canal de lote)", async () => {
    const buffer = workbookBuffer([["María Cabrera", "0991234567", "", "canal-fila-9"]]);
    const resultado = await parsearExcelCargaMasiva(buffer);

    expect(filaParseadaALeadInput(resultado.validas[0])).toEqual({
      nombre: "María Cabrera",
      telefono: "0991234567",
      correo: undefined,
      canalManualId: "canal-fila-9",
    });
  });
});

describe("descargarTemplateCargaMasiva", () => {
  it("dispara la descarga de un .xlsx con los headers fijos del template", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    let nombreDescargado = "";
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const elemento = originalCreateElement(tag);
      if (tag === "a") {
        Object.defineProperty(elemento, "download", {
          set: (valor: string) => {
            nombreDescargado = valor;
          },
          get: () => nombreDescargado,
        });
      }
      return elemento;
    });

    descargarTemplateCargaMasiva();

    expect(clickSpy).toHaveBeenCalled();
    expect(nombreDescargado).toBe("plantilla-carga-masiva-leads.xlsx");
  });
});
