import { describe, expect, it } from "vitest";
import {
  buildFiltrosActivos,
  buildLeadsQueryParams,
  FILTROS_LEADS_VACIOS,
  getResponsable,
  type LeadsFiltrosState,
} from "@/funcionalidades/leads/leads.utils";
import type { Lead, ResponsableLead } from "@/tipos/lead";

const asesor: ResponsableLead = { id: "a1", nombre: "Marta Herrera", rol: "ASESOR" };
const vendedor: ResponsableLead = { id: "v1", nombre: "Julián Peña", rol: "VENDEDOR" };

function leadParcial(overrides: Partial<Lead>): Lead {
  return {
    id: "l1",
    cliente: {
      id: "c1",
      nombre: "Cliente",
      telefonoOriginal: "0991234567",
      telefonoNormalizado: "+593991234567",
      correoPrincipal: null,
    },
    campania: null,
    origen: "NUEVO",
    redSocial: "FACEBOOK",
    etapa: "NUEVO",
    semaforo: "VERDE",
    puntuacion: 80,
    asesor: null,
    vendedor: null,
    slaInicioEn: null,
    ingresadoEn: new Date().toISOString(),
    cerradoEn: null,
    ...overrides,
  };
}

describe("getResponsable", () => {
  it("devuelve el vendedor cuando el lead ya fue traspasado (docs/02-reglas-negocio.md §5)", () => {
    expect(getResponsable(leadParcial({ asesor, vendedor }))).toEqual(vendedor);
  });

  it("devuelve el asesor cuando todavía no hay traspaso", () => {
    expect(getResponsable(leadParcial({ asesor, vendedor: null }))).toEqual(asesor);
  });

  it("devuelve null cuando el lead no tiene responsable asignado", () => {
    expect(getResponsable(leadParcial({ asesor: null, vendedor: null }))).toBeNull();
  });
});

describe("buildLeadsQueryParams", () => {
  it("con filtros vacíos, solo manda paginación (ningún filtro 'todos'/vacío se envía)", () => {
    const params = buildLeadsQueryParams(FILTROS_LEADS_VACIOS, 2, 20);
    expect(params).toEqual({ pagina: 2, porPagina: 20 });
  });

  it("traduce cada filtro seleccionado a su campo del contrato de query", () => {
    const filtros: LeadsFiltrosState = {
      busqueda: "  roberto  ",
      etapa: "CONTACTADO",
      semaforo: "ROJO",
      redSocial: "INSTAGRAM",
      campaniaId: "camp-1",
      responsableId: "asesor-1",
      estadoSla: "ATRASADO",
      fechaDesde: "2026-08-01",
      fechaHasta: "2026-08-13",
    };

    expect(buildLeadsQueryParams(filtros, 1, 10)).toEqual({
      pagina: 1,
      porPagina: 10,
      busqueda: "roberto",
      etapa: "CONTACTADO",
      semaforo: "ROJO",
      redSocial: "INSTAGRAM",
      campaniaId: "camp-1",
      responsableId: "asesor-1",
      estadoSla: "ATRASADO",
      fechaDesde: "2026-08-01",
      fechaHasta: "2026-08-13",
    });
  });

  it("una búsqueda de solo espacios se trata como vacía", () => {
    const params = buildLeadsQueryParams({ ...FILTROS_LEADS_VACIOS, busqueda: "   " }, 1, 10);
    expect(params.busqueda).toBeUndefined();
  });
});

describe("buildFiltrosActivos", () => {
  const campanias = [{ id: "camp-1", nombre: "Campaña Verano" }];
  const responsables = [{ id: "asesor-1", nombre: "Marta Herrera" }];

  it("con filtros vacíos, no devuelve ningún chip", () => {
    expect(buildFiltrosActivos(FILTROS_LEADS_VACIOS, campanias, responsables)).toEqual([]);
  });

  it("devuelve exactamente un chip por campo activo, en el orden fijo de campos", () => {
    const filtros: LeadsFiltrosState = {
      ...FILTROS_LEADS_VACIOS,
      busqueda: "roberto",
      etapa: "CONTACTADO",
      fechaDesde: "2026-08-01",
    };

    expect(buildFiltrosActivos(filtros, campanias, responsables)).toEqual([
      { campo: "busqueda", etiqueta: "Búsqueda", valorLegible: "roberto" },
      { campo: "etapa", etiqueta: "Etapa", valorLegible: "Contactado" },
      { campo: "fechaDesde", etiqueta: "Ingreso desde", valorLegible: "01/08/2026" },
    ]);
  });

  it("resuelve campaña y responsable por nombre a partir de sus catálogos", () => {
    const filtros: LeadsFiltrosState = {
      ...FILTROS_LEADS_VACIOS,
      campaniaId: "camp-1",
      responsableId: "asesor-1",
    };

    expect(buildFiltrosActivos(filtros, campanias, responsables)).toEqual([
      { campo: "campaniaId", etiqueta: "Campaña", valorLegible: "Campaña Verano" },
      { campo: "responsableId", etiqueta: "Responsable", valorLegible: "Marta Herrera" },
    ]);
  });

  it("nunca devuelve más de un chip por campo", () => {
    const filtros: LeadsFiltrosState = {
      ...FILTROS_LEADS_VACIOS,
      etapa: "CITA",
      semaforo: "VERDE",
      redSocial: "FACEBOOK",
      estadoSla: "EN_RIESGO",
    };

    const chips = buildFiltrosActivos(filtros, campanias, responsables);
    const campos = chips.map((c) => c.campo);
    expect(new Set(campos).size).toBe(campos.length);
  });
});
