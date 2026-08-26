import type { EtapaLead, RolUsuario } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  canClose,
  canEdit,
  canRead,
  type LeadAcceso,
  type LeadCierre,
  type UsuarioAcceso,
} from "../src/services/leads.access.js";

function usuario(id: string, rol: RolUsuario): UsuarioAcceso {
  return { id, rol };
}

const ASESOR_A = "asesor-a";
const VENDEDOR_V = "vendedor-v";
const OTRO = "usuario-sin-relacion";

describe("services/leads.access — canRead / canEdit (edición genérica, no cierre — ver canClose) (pura, sin BD, DD5)", () => {
  it("Administrador puede leer y editar (edición genérica, no cierre) cualquier lead, sin relación con él", () => {
    const lead: LeadAcceso = { asesorId: ASESOR_A, vendedorId: null };
    const admin = usuario(OTRO, "ADMINISTRADOR");

    expect(canRead(admin, lead)).toBe(true);
    expect(canEdit(admin, lead)).toBe(true);

    // canClose companion (memoria #82/D2): NUEVO deniega incluso al admin;
    // fuera de NUEVO, admin cierra sin chequeo de titularidad.
    const leadNuevo: LeadCierre = { ...lead, etapa: "NUEVO" };
    expect(canClose(admin, leadNuevo)).toBe("etapa_no_cerrable");
    const leadContactado: LeadCierre = { ...lead, etapa: "CONTACTADO" };
    expect(canClose(admin, leadContactado)).toBeNull();
  });

  it("Supervisor puede leer y editar (edición genérica, no cierre) cualquier lead, sin relación con él", () => {
    const lead: LeadAcceso = { asesorId: ASESOR_A, vendedorId: null };
    const supervisor = usuario(OTRO, "SUPERVISOR");

    expect(canRead(supervisor, lead)).toBe(true);
    expect(canEdit(supervisor, lead)).toBe(true);

    // canClose companion (D2/D3): supervisor nunca cierra — el gate de etapa
    // va primero (NUEVO → etapa_no_cerrable), luego el motivo es "rol".
    const leadNuevo: LeadCierre = { ...lead, etapa: "NUEVO" };
    expect(canClose(supervisor, leadNuevo)).toBe("etapa_no_cerrable");
    const leadContactado: LeadCierre = { ...lead, etapa: "CONTACTADO" };
    expect(canClose(supervisor, leadContactado)).toBe("rol");
  });

  it("el asesor asignado puede leer y editar (edición genérica, no cierre) su propio lead sin traspaso", () => {
    const lead: LeadAcceso = { asesorId: ASESOR_A, vendedorId: null };
    const asesor = usuario(ASESOR_A, "ASESOR");

    expect(canRead(asesor, lead)).toBe(true);
    expect(canEdit(asesor, lead)).toBe(true);

    // canClose companion: titular (responsable operativo = asesorId, sin
    // traspaso) puede cerrar fuera de NUEVO.
    const leadContactado: LeadCierre = { ...lead, etapa: "CONTACTADO" };
    expect(canClose(asesor, leadContactado)).toBeNull();
  });

  it("un asesor sin relación con el lead no puede leer ni editar (edición genérica, no cierre) (403 en la capa HTTP)", () => {
    const lead: LeadAcceso = { asesorId: ASESOR_A, vendedorId: null };
    const ajeno = usuario(OTRO, "ASESOR");

    expect(canRead(ajeno, lead)).toBe(false);
    expect(canEdit(ajeno, lead)).toBe(false);

    // canClose companion: no titular → no_es_titular fuera de NUEVO.
    const leadContactado: LeadCierre = { ...lead, etapa: "CONTACTADO" };
    expect(canClose(ajeno, leadContactado)).toBe("no_es_titular");
  });

  it("lead traspasado (asesorId=A, vendedorId=V): A conserva lectura pero pierde edición (edición genérica, no cierre)", () => {
    const lead: LeadAcceso = { asesorId: ASESOR_A, vendedorId: VENDEDOR_V };
    const asesorTraspasado = usuario(ASESOR_A, "ASESOR");

    expect(canRead(asesorTraspasado, lead)).toBe(true);
    expect(canEdit(asesorTraspasado, lead)).toBe(false);

    // canClose companion: tras el traspaso, el responsable operativo es V —
    // el asesor origen ya no puede cerrar (no_es_titular).
    const leadCita: LeadCierre = { ...lead, etapa: "CITA" };
    expect(canClose(asesorTraspasado, leadCita)).toBe("no_es_titular");
  });

  it("lead traspasado (asesorId=A, vendedorId=V): V puede leer y editar (edición genérica, no cierre — responsable operativo)", () => {
    const lead: LeadAcceso = { asesorId: ASESOR_A, vendedorId: VENDEDOR_V };
    const vendedor = usuario(VENDEDOR_V, "VENDEDOR");

    expect(canRead(vendedor, lead)).toBe(true);
    expect(canEdit(vendedor, lead)).toBe(true);

    // canClose companion: V es el responsable operativo actual → puede cerrar.
    const leadCita: LeadCierre = { ...lead, etapa: "CITA" };
    expect(canClose(vendedor, leadCita)).toBeNull();
  });

  it("sin traspaso (vendedorId=null): el responsable operativo de edición (y cierre) es el propio asesor", () => {
    const lead: LeadAcceso = { asesorId: ASESOR_A, vendedorId: null };
    const asesor = usuario(ASESOR_A, "ASESOR");
    const vendedorCualquiera = usuario(VENDEDOR_V, "VENDEDOR");

    expect(canEdit(asesor, lead)).toBe(true);
    expect(canEdit(vendedorCualquiera, lead)).toBe(false);

    // canClose companion: mismo criterio de titularidad que canEdit fuera de NUEVO.
    const leadCita: LeadCierre = { ...lead, etapa: "CITA" };
    expect(canClose(asesor, leadCita)).toBeNull();
    expect(canClose(vendedorCualquiera, leadCita)).toBe("no_es_titular");
  });
});

describe("services/leads.access — canClose (M-hardening Bloque A, D1-D3, memoria #82)", () => {
  it.each<RolUsuario>(["ADMINISTRADOR", "SUPERVISOR", "ASESOR", "VENDEDOR"])(
    "etapa NUEVO deniega el cierre para %s sin excepción, incluso sin relación con el lead",
    (rol) => {
      const lead: LeadCierre = { asesorId: ASESOR_A, vendedorId: null, etapa: "NUEVO" };
      expect(canClose(usuario(OTRO, rol), lead)).toBe("etapa_no_cerrable");
    },
  );

  it("VENDEDOR titular (responsable operativo) puede cerrar fuera de NUEVO", () => {
    const lead: LeadCierre = { asesorId: ASESOR_A, vendedorId: VENDEDOR_V, etapa: "CITA" };
    expect(canClose(usuario(VENDEDOR_V, "VENDEDOR"), lead)).toBeNull();
  });

  it("VENDEDOR no titular no puede cerrar (no_es_titular)", () => {
    const lead: LeadCierre = { asesorId: ASESOR_A, vendedorId: VENDEDOR_V, etapa: "CITA" };
    expect(canClose(usuario(OTRO, "VENDEDOR"), lead)).toBe("no_es_titular");
  });

  it("prueba de triangulación: VENDEDOR no titular cerrando desde CITA (combo distinto de rol×etapa) sigue denegado", () => {
    const lead: LeadCierre = { asesorId: ASESOR_A, vendedorId: null, etapa: "CITA" };
    expect(canClose(usuario(VENDEDOR_V, "VENDEDOR"), lead)).toBe("no_es_titular");
  });
});
