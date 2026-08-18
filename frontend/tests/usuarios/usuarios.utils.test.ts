import { describe, expect, it } from "vitest";
import {
  buildUsuariosQueryParams,
  FILTROS_USUARIOS_VACIOS,
  type UsuariosFiltrosState,
} from "@/funcionalidades/usuarios/usuarios.utils";

describe("buildUsuariosQueryParams", () => {
  it("con filtros vacíos, solo manda paginación (ningún filtro 'todos'/vacío se envía)", () => {
    const params = buildUsuariosQueryParams(FILTROS_USUARIOS_VACIOS, 2, 10);
    expect(params).toEqual({ pagina: 2, limite: 10 });
  });

  it("recorta espacios de la búsqueda y la manda solo si queda contenido", () => {
    const filtros: UsuariosFiltrosState = { ...FILTROS_USUARIOS_VACIOS, busqueda: "  ana  " };
    expect(buildUsuariosQueryParams(filtros, 1, 20)).toEqual({
      pagina: 1,
      limite: 20,
      busqueda: "ana",
    });
  });

  it("una búsqueda de solo espacios no se manda", () => {
    const filtros: UsuariosFiltrosState = { ...FILTROS_USUARIOS_VACIOS, busqueda: "   " };
    expect(buildUsuariosQueryParams(filtros, 1, 20)).toEqual({ pagina: 1, limite: 20 });
  });

  it("traduce el rol seleccionado al campo `rol`", () => {
    const filtros: UsuariosFiltrosState = { ...FILTROS_USUARIOS_VACIOS, rol: "SUPERVISOR" };
    expect(buildUsuariosQueryParams(filtros, 1, 20)).toEqual({
      pagina: 1,
      limite: 20,
      rol: "SUPERVISOR",
    });
  });

  it("traduce 'ACTIVOS' a `activo: true`", () => {
    const filtros: UsuariosFiltrosState = { ...FILTROS_USUARIOS_VACIOS, estado: "ACTIVOS" };
    expect(buildUsuariosQueryParams(filtros, 1, 20)).toEqual({
      pagina: 1,
      limite: 20,
      activo: true,
    });
  });

  it("traduce 'INACTIVOS' a `activo: false`", () => {
    const filtros: UsuariosFiltrosState = { ...FILTROS_USUARIOS_VACIOS, estado: "INACTIVOS" };
    expect(buildUsuariosQueryParams(filtros, 1, 20)).toEqual({
      pagina: 1,
      limite: 20,
      activo: false,
    });
  });

  it("combina búsqueda, rol y estado a la vez", () => {
    const filtros: UsuariosFiltrosState = {
      busqueda: "gómez",
      rol: "VENDEDOR",
      estado: "ACTIVOS",
    };
    expect(buildUsuariosQueryParams(filtros, 3, 10)).toEqual({
      pagina: 3,
      limite: 10,
      busqueda: "gómez",
      rol: "VENDEDOR",
      activo: true,
    });
  });
});
