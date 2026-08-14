import type { RolUsuario } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canEdit, canRead, type LeadAcceso, type UsuarioAcceso } from "../src/services/leads.access.js";

function usuario(id: string, rol: RolUsuario): UsuarioAcceso {
  return { id, rol };
}

const ASESOR_A = "asesor-a";
const VENDEDOR_V = "vendedor-v";
const OTRO = "usuario-sin-relacion";

describe("services/leads.access — canRead / canEdit (pura, sin BD, DD5)", () => {
  it("Administrador puede leer y editar cualquier lead, sin relación con él", () => {
    const lead: LeadAcceso = { asesorId: ASESOR_A, vendedorId: null };
    const admin = usuario(OTRO, "ADMINISTRADOR");

    expect(canRead(admin, lead)).toBe(true);
    expect(canEdit(admin, lead)).toBe(true);
  });

  it("Supervisor puede leer y editar cualquier lead, sin relación con él", () => {
    const lead: LeadAcceso = { asesorId: ASESOR_A, vendedorId: null };
    const supervisor = usuario(OTRO, "SUPERVISOR");

    expect(canRead(supervisor, lead)).toBe(true);
    expect(canEdit(supervisor, lead)).toBe(true);
  });

  it("el asesor asignado puede leer y editar su propio lead sin traspaso", () => {
    const lead: LeadAcceso = { asesorId: ASESOR_A, vendedorId: null };
    const asesor = usuario(ASESOR_A, "ASESOR");

    expect(canRead(asesor, lead)).toBe(true);
    expect(canEdit(asesor, lead)).toBe(true);
  });

  it("un asesor sin relación con el lead no puede leer ni editar (403 en la capa HTTP)", () => {
    const lead: LeadAcceso = { asesorId: ASESOR_A, vendedorId: null };
    const ajeno = usuario(OTRO, "ASESOR");

    expect(canRead(ajeno, lead)).toBe(false);
    expect(canEdit(ajeno, lead)).toBe(false);
  });

  it("lead traspasado (asesorId=A, vendedorId=V): A conserva lectura pero pierde edición", () => {
    const lead: LeadAcceso = { asesorId: ASESOR_A, vendedorId: VENDEDOR_V };
    const asesorTraspasado = usuario(ASESOR_A, "ASESOR");

    expect(canRead(asesorTraspasado, lead)).toBe(true);
    expect(canEdit(asesorTraspasado, lead)).toBe(false);
  });

  it("lead traspasado (asesorId=A, vendedorId=V): V puede leer y editar (responsable operativo)", () => {
    const lead: LeadAcceso = { asesorId: ASESOR_A, vendedorId: VENDEDOR_V };
    const vendedor = usuario(VENDEDOR_V, "VENDEDOR");

    expect(canRead(vendedor, lead)).toBe(true);
    expect(canEdit(vendedor, lead)).toBe(true);
  });

  it("sin traspaso (vendedorId=null): el responsable operativo de edición es el propio asesor", () => {
    const lead: LeadAcceso = { asesorId: ASESOR_A, vendedorId: null };
    const asesor = usuario(ASESOR_A, "ASESOR");
    const vendedorCualquiera = usuario(VENDEDOR_V, "VENDEDOR");

    expect(canEdit(asesor, lead)).toBe(true);
    expect(canEdit(vendedorCualquiera, lead)).toBe(false);
  });
});
