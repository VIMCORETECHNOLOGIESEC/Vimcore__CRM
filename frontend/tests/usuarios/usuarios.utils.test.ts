import { describe, expect, it } from "vitest";
import {
  buildUsuariosQueryParams,
  FILTROS_USUARIOS_VACIOS,
  type UsuariosFiltrosState,
} from "@/funcionalidades/usuarios/usuarios.utils";

describe("buildUsuariosQueryParams", () => {
  it("con filtros vacíos, el default 'Activos' manda `activo: true` y el default `soloHoldingWide: true` manda `soloHoldingWide: true` (holding-wide-only por defecto, decisión de producto)", () => {
    const params = buildUsuariosQueryParams(FILTROS_USUARIOS_VACIOS, 2, 10);
    expect(params).toEqual({ pagina: 2, limite: 10, activo: true, soloHoldingWide: true });
  });

  it("recorta espacios de la búsqueda y la manda solo si queda contenido", () => {
    const filtros: UsuariosFiltrosState = {
      ...FILTROS_USUARIOS_VACIOS,
      estado: "TODOS",
      busqueda: "  ana  ",
    };
    expect(buildUsuariosQueryParams(filtros, 1, 20)).toEqual({
      pagina: 1,
      limite: 20,
      busqueda: "ana",
      soloHoldingWide: true,
    });
  });

  it("una búsqueda de solo espacios no se manda", () => {
    const filtros: UsuariosFiltrosState = {
      ...FILTROS_USUARIOS_VACIOS,
      estado: "TODOS",
      busqueda: "   ",
    };
    expect(buildUsuariosQueryParams(filtros, 1, 20)).toEqual({
      pagina: 1,
      limite: 20,
      soloHoldingWide: true,
    });
  });

  it("traduce el rol seleccionado al campo `rol`", () => {
    const filtros: UsuariosFiltrosState = {
      ...FILTROS_USUARIOS_VACIOS,
      estado: "TODOS",
      rol: "SUPERVISOR",
    };
    expect(buildUsuariosQueryParams(filtros, 1, 20)).toEqual({
      pagina: 1,
      limite: 20,
      rol: "SUPERVISOR",
      soloHoldingWide: true,
    });
  });

  it("traduce 'ACTIVOS' a `activo: true`", () => {
    const filtros: UsuariosFiltrosState = { ...FILTROS_USUARIOS_VACIOS, estado: "ACTIVOS" };
    expect(buildUsuariosQueryParams(filtros, 1, 20)).toEqual({
      pagina: 1,
      limite: 20,
      activo: true,
      soloHoldingWide: true,
    });
  });

  it("traduce 'INACTIVOS' a `activo: false`", () => {
    const filtros: UsuariosFiltrosState = { ...FILTROS_USUARIOS_VACIOS, estado: "INACTIVOS" };
    expect(buildUsuariosQueryParams(filtros, 1, 20)).toEqual({
      pagina: 1,
      limite: 20,
      activo: false,
      soloHoldingWide: true,
    });
  });

  it("combina búsqueda, rol y estado a la vez", () => {
    const filtros: UsuariosFiltrosState = {
      busqueda: "gómez",
      rol: "VENDEDOR",
      estado: "ACTIVOS",
      soloHoldingWide: false,
    };
    expect(buildUsuariosQueryParams(filtros, 3, 10)).toEqual({
      pagina: 3,
      limite: 10,
      busqueda: "gómez",
      rol: "VENDEDOR",
      activo: true,
    });
  });

  it("soloHoldingWide en true (default) se manda al backend -- solo tiene efecto para una sesión holding-wide (Item 25)", () => {
    expect(buildUsuariosQueryParams(FILTROS_USUARIOS_VACIOS, 1, 20)).toEqual({
      pagina: 1,
      limite: 20,
      activo: true,
      soloHoldingWide: true,
    });
  });

  it("soloHoldingWide en false (checkbox «ver todas las empresas» tildado) NO se manda -- omitido, no `false` explícito", () => {
    const filtros: UsuariosFiltrosState = {
      ...FILTROS_USUARIOS_VACIOS,
      estado: "TODOS",
      soloHoldingWide: false,
    };
    expect(buildUsuariosQueryParams(filtros, 1, 20)).toEqual({
      pagina: 1,
      limite: 20,
    });
  });

  it("con `empresaId` explícito (drill-down a una empresa puntual), NUNCA manda `soloHoldingWide` aunque siga en su default `true` -- el backend prioriza soloHoldingWide sobre empresaId y devolvería 0 usuarios si mandáramos ambos", () => {
    expect(buildUsuariosQueryParams(FILTROS_USUARIOS_VACIOS, 1, 20, "empresa-77")).toEqual({
      pagina: 1,
      limite: 20,
      activo: true,
      empresaId: "empresa-77",
    });
  });

  it("con `empresaId` explícito y `soloHoldingWide: false` (checkbox tildado, caso imposible en la práctica -- ver `mostrarFiltroHoldingWide`), tampoco manda `soloHoldingWide`", () => {
    const filtros: UsuariosFiltrosState = { ...FILTROS_USUARIOS_VACIOS, soloHoldingWide: false };
    expect(buildUsuariosQueryParams(filtros, 1, 20, "empresa-77")).toEqual({
      pagina: 1,
      limite: 20,
      activo: true,
      empresaId: "empresa-77",
    });
  });
});
