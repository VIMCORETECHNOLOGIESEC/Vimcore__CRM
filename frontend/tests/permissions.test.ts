import { describe, expect, it } from "vitest";
import { getLandingRoute, hasRoleAccess, hasScopeAccess } from "@/funcionalidades/autenticacion/permissions";

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

  it.each(["SUPERVISOR_HOLDING", "SUPER_ADMIN"] as const)(
    "permite el acceso a %s aunque la lista de roles permitidos no lo incluya (mismo bypass que require-role.middleware.ts::ROLES_HOLDING_BYPASS en el backend)",
    (rol) => {
      expect(hasRoleAccess(rol, ["ADMINISTRADOR"])).toBe(true);
    },
  );
});

describe("hasScopeAccess", () => {
  it("permite el acceso cuando no se especifican scopes permitidos", () => {
    expect(hasScopeAccess("company", undefined)).toBe(true);
  });

  it("permite el acceso cuando la lista de scopes permitidos está vacía", () => {
    expect(hasScopeAccess("holding", [])).toBe(true);
  });

  it("permite el acceso cuando el scope de la sesión está en la lista permitida", () => {
    expect(hasScopeAccess("holding", ["holding"])).toBe(true);
  });

  it("deniega el acceso cuando el scope de la sesión no está en la lista permitida", () => {
    expect(hasScopeAccess("company", ["holding"])).toBe(false);
  });

  it("deniega el acceso cuando no hay scope de sesión (null) y hay scopes restringidos", () => {
    expect(hasScopeAccess(null, ["holding"])).toBe(false);
  });

  it("deniega el acceso cuando no hay scope de sesión (undefined) y hay scopes restringidos", () => {
    expect(hasScopeAccess(undefined, ["holding"])).toBe(false);
  });
});

describe("getLandingRoute", () => {
  it.each(["ADMINISTRADOR", "SUPERVISOR", "ASESOR", "VENDEDOR"] as const)(
    "devuelve una ruta accesible para el rol %s",
    (rol) => {
      const ruta = getLandingRoute(rol);
      expect(ruta).toMatch(/^\//);
    },
  );

  it("devuelve /panel para los 4 roles hoy (F3+ todavía no distingue landings por rol)", () => {
    expect(getLandingRoute("ADMINISTRADOR")).toBe("/panel");
    expect(getLandingRoute("SUPERVISOR")).toBe("/panel");
    expect(getLandingRoute("ASESOR")).toBe("/panel");
    expect(getLandingRoute("VENDEDOR")).toBe("/panel");
  });
});
