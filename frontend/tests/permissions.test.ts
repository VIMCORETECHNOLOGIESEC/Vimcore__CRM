import { describe, expect, it } from "vitest";
import { hasRoleAccess } from "@/funcionalidades/autenticacion/permissions";

describe("hasRoleAccess", () => {
  it("permite el acceso cuando no se especifican roles permitidos", () => {
    expect(hasRoleAccess("VENDEDOR", undefined)).toBe(true);
  });

  it("permite el acceso cuando la lista de roles permitidos está vacía", () => {
    expect(hasRoleAccess("VENDEDOR", [])).toBe(true);
  });

  it("permite el acceso cuando el rol del usuario está en la lista permitida", () => {
    expect(hasRoleAccess("ADMINISTRADOR", ["ADMINISTRADOR", "SUPERVISOR"])).toBe(true);
  });

  it("deniega el acceso cuando el rol del usuario no está en la lista permitida", () => {
    expect(hasRoleAccess("ASESOR", ["ADMINISTRADOR"])).toBe(false);
  });

  it("deniega el acceso cuando no hay rol de usuario (null) y hay roles restringidos", () => {
    expect(hasRoleAccess(null, ["ADMINISTRADOR"])).toBe(false);
  });

  it("deniega el acceso cuando no hay rol de usuario (undefined) y hay roles restringidos", () => {
    expect(hasRoleAccess(undefined, ["ADMINISTRADOR"])).toBe(false);
  });
});
