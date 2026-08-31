import { describe, expect, it } from "vitest";
import {
  buildFiltrosActivos,
  buildQueryParams,
  FILTRO_TODOS,
  FILTROS_VACIOS,
  type FiltrosState,
} from "@/funcionalidades/oportunidades/oportunidades.utils";

describe("buildQueryParams", () => {
  it("con filtros vacíos, solo manda pagina + limite", () => {
    expect(buildQueryParams(FILTROS_VACIOS, 2, 25)).toEqual({ pagina: 2, limite: 25 });
  });

  it("incluye siempre pagina + limite aunque haya filtros activos", () => {
    const filtros: FiltrosState = { etapa: "CONTACTADO", asesorId: "asesor-1" };
    expect(buildQueryParams(filtros, 3, 50)).toEqual({
      pagina: 3,
      limite: 50,
      etapa: "CONTACTADO",
      asesorId: "asesor-1",
    });
  });

  it("descarta los campos en FILTRO_TODOS", () => {
    const filtros: FiltrosState = { etapa: FILTRO_TODOS, asesorId: "asesor-9" };
    const params = buildQueryParams(filtros, 1, 25);
    expect(params.etapa).toBeUndefined();
    expect(params.asesorId).toBe("asesor-9");
  });

  it("reenvía empresaVistaId como empresaId solo cuando es truthy", () => {
    expect(buildQueryParams(FILTROS_VACIOS, 1, 25, "emp-9")).toEqual({
      pagina: 1,
      limite: 25,
      empresaId: "emp-9",
    });
    expect(buildQueryParams(FILTROS_VACIOS, 1, 25, "")).toEqual({ pagina: 1, limite: 25 });
    expect(buildQueryParams(FILTROS_VACIOS, 1, 25, undefined)).toEqual({ pagina: 1, limite: 25 });
  });
});

describe("buildFiltrosActivos", () => {
  it("con filtros vacíos no devuelve ningún chip", () => {
    expect(buildFiltrosActivos(FILTROS_VACIOS)).toEqual([]);
  });

  it("devuelve un chip por campo activo, en orden fijo, con etiqueta ES", () => {
    const filtros: FiltrosState = { etapa: "NO_VENTA", asesorId: "asesor-1" };
    expect(buildFiltrosActivos(filtros, [{ id: "asesor-1", nombre: "Marta Herrera" }])).toEqual([
      { campo: "etapa", etiqueta: "Etapa", valorLegible: "No Venta" },
      { campo: "asesorId", etiqueta: "Asesor", valorLegible: "Marta Herrera" },
    ]);
  });

  it("usa el mapa de catálogos para la etapa", () => {
    expect(buildFiltrosActivos({ etapa: "CITA", asesorId: FILTRO_TODOS })).toEqual([
      { campo: "etapa", etiqueta: "Etapa", valorLegible: "Cita" },
    ]);
  });

  it("cae al id del asesor cuando no está en el catálogo provisto", () => {
    expect(buildFiltrosActivos({ etapa: FILTRO_TODOS, asesorId: "asesor-x" })).toEqual([
      { campo: "asesorId", etiqueta: "Asesor", valorLegible: "asesor-x" },
    ]);
  });

  it("nunca devuelve más de un chip por campo", () => {
    const filtros: FiltrosState = { etapa: "VENTA", asesorId: "asesor-1" };
    const chips = buildFiltrosActivos(filtros);
    const campos = chips.map((c) => c.campo);
    expect(new Set(campos).size).toBe(campos.length);
  });
});
