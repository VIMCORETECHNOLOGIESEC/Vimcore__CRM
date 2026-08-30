import { describe, expect, it } from "vitest";
import { partitionByEmpresa } from "../src/services/company-partition.js";

describe("partitionByEmpresa", () => {
  it("agrupa cada fila únicamente con las de su empresa y conserva el orden", () => {
    const rows = [
      { id: "a-1", empresaId: "empresa-A" },
      { id: "b-1", empresaId: "empresa-B" },
      { id: "a-2", empresaId: "empresa-A" },
    ];
    expect([...partitionByEmpresa(rows)]).toEqual([
      ["empresa-A", [rows[0], rows[2]]],
      ["empresa-B", [rows[1]]],
    ]);
  });

  it("no fabrica grupos cuando el descubrimiento no devuelve filas", () => {
    expect([...partitionByEmpresa([])]).toEqual([]);
  });
});
