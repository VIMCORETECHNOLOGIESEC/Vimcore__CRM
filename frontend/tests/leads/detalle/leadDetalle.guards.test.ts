import { describe, expect, it } from "vitest";
import {
  canHandoffToVendedor,
  canReassignLead,
} from "@/funcionalidades/leads/detalle/leadDetalle.guards";
import type { Lead, ResponsableLead } from "@/tipos/lead";
import type { AuthenticatedUser } from "@/tipos/usuario";

const asesorPropio: ResponsableLead = { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" };
const otroAsesor: ResponsableLead = { id: "asesor-2", nombre: "Julián Peña", rol: "ASESOR" };

function leadParcial(overrides: Partial<Lead>): Lead {
  return {
    id: "lead-01",
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
    etapa: "CONTACTADO",
    semaforo: "ROJO",
    puntuacion: 30,
    asesor: asesorPropio,
    vendedor: null,
    slaInicioEn: null,
    ingresadoEn: new Date().toISOString(),
    cerradoEn: null,
    ...overrides,
  };
}

function usuario(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return { id: "asesor-1", nombre: "Marta Herrera", correo: "marta@crm.test", rol: "ASESOR", ...overrides };
}

describe("canHandoffToVendedor (docs/02-reglas-negocio.md §5)", () => {
  it("deshabilitado en etapa NUEVO, incluso para el propio asesor", () => {
    const lead = leadParcial({ etapa: "NUEVO" });
    expect(canHandoffToVendedor(lead, usuario({ rol: "ASESOR" }))).toBe(false);
  });

  it("habilitado en CONTACTADO para el asesor dueño del lead", () => {
    const lead = leadParcial({ etapa: "CONTACTADO", asesor: asesorPropio });
    expect(canHandoffToVendedor(lead, usuario({ id: "asesor-1", rol: "ASESOR" }))).toBe(true);
  });

  it("habilitado en CITA para el asesor dueño del lead", () => {
    const lead = leadParcial({ etapa: "CITA", asesor: asesorPropio });
    expect(canHandoffToVendedor(lead, usuario({ id: "asesor-1", rol: "ASESOR" }))).toBe(true);
  });

  it("un asesor no puede traspasar un lead que no es suyo", () => {
    const lead = leadParcial({ etapa: "CONTACTADO", asesor: otroAsesor });
    expect(canHandoffToVendedor(lead, usuario({ id: "asesor-1", rol: "ASESOR" }))).toBe(false);
  });

  it("administrador puede traspasar cualquier lead desde CONTACTADO en adelante", () => {
    const lead = leadParcial({ etapa: "CONTACTADO", asesor: otroAsesor });
    expect(canHandoffToVendedor(lead, usuario({ id: "admin-1", rol: "ADMINISTRADOR" }))).toBe(true);
  });

  it("supervisor puede traspasar cualquier lead desde CONTACTADO en adelante", () => {
    const lead = leadParcial({ etapa: "CITA", asesor: otroAsesor });
    expect(canHandoffToVendedor(lead, usuario({ id: "sup-1", rol: "SUPERVISOR" }))).toBe(true);
  });

  it("vendedor nunca traspasa", () => {
    const lead = leadParcial({ etapa: "CONTACTADO" });
    expect(canHandoffToVendedor(lead, usuario({ id: "vendedor-1", rol: "VENDEDOR" }))).toBe(false);
  });

  it("deshabilitado en etapas terminales (VENTA/NO_VENTA), incluso para administrador", () => {
    const leadVenta = leadParcial({ etapa: "VENTA" });
    const leadNoVenta = leadParcial({ etapa: "NO_VENTA" });
    expect(canHandoffToVendedor(leadVenta, usuario({ id: "admin-1", rol: "ADMINISTRADOR" }))).toBe(false);
    expect(canHandoffToVendedor(leadNoVenta, usuario({ id: "admin-1", rol: "ADMINISTRADOR" }))).toBe(false);
  });
});

describe("canReassignLead (docs/02-reglas-negocio.md §5)", () => {
  it("un asesor puede reasignar su propio lead en ROJO", () => {
    const lead = leadParcial({ asesor: asesorPropio, semaforo: "ROJO" });
    expect(canReassignLead(lead, usuario({ id: "asesor-1", rol: "ASESOR" }))).toBe(true);
  });

  it("un asesor puede reasignar su propio lead en AMARILLO", () => {
    const lead = leadParcial({ asesor: asesorPropio, semaforo: "AMARILLO" });
    expect(canReassignLead(lead, usuario({ id: "asesor-1", rol: "ASESOR" }))).toBe(true);
  });

  it("un asesor NO puede reasignar su propio lead en VERDE", () => {
    const lead = leadParcial({ asesor: asesorPropio, semaforo: "VERDE" });
    expect(canReassignLead(lead, usuario({ id: "asesor-1", rol: "ASESOR" }))).toBe(false);
  });

  it("un asesor no puede reasignar un lead que no es suyo, aunque esté en rojo", () => {
    const lead = leadParcial({ asesor: otroAsesor, semaforo: "ROJO" });
    expect(canReassignLead(lead, usuario({ id: "asesor-1", rol: "ASESOR" }))).toBe(false);
  });

  it("vendedor nunca reasigna", () => {
    const lead = leadParcial({ semaforo: "ROJO" });
    expect(canReassignLead(lead, usuario({ id: "vendedor-1", rol: "VENDEDOR" }))).toBe(false);
  });

  it("administrador reasigna cualquier lead sin condición de semáforo", () => {
    const lead = leadParcial({ semaforo: "VERDE", asesor: otroAsesor });
    expect(canReassignLead(lead, usuario({ id: "admin-1", rol: "ADMINISTRADOR" }))).toBe(true);
  });

  it("supervisor reasigna cualquier lead sin condición de semáforo", () => {
    const lead = leadParcial({ semaforo: "VERDE", asesor: otroAsesor });
    expect(canReassignLead(lead, usuario({ id: "sup-1", rol: "SUPERVISOR" }))).toBe(true);
  });
});
