import type { EtapaLead, RolUsuario, Semaforo } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  canReassign,
  canTransfer,
  type LeadReasignacion,
  type LeadTraspaso,
  type UsuarioAcceso,
} from "../src/services/leads.access.js";

function usuario(id: string, rol: RolUsuario): UsuarioAcceso {
  return { id, rol };
}

const ASESOR_A = "asesor-a";
const OTRO = "usuario-sin-relacion";

describe("services/leads.access — canReassign (M6, DD9/D8/DD6)", () => {
  it("Administrador puede reasignar cualquier lead, semaforo verde incluido", () => {
    const lead: LeadReasignacion = { asesorId: ASESOR_A, vendedorId: null, semaforo: "VERDE" };
    expect(canReassign(usuario(OTRO, "ADMINISTRADOR"), lead)).toBeNull();
  });

  it("Supervisor puede reasignar cualquier lead, semaforo verde incluido", () => {
    const lead: LeadReasignacion = { asesorId: ASESOR_A, vendedorId: null, semaforo: "VERDE" };
    expect(canReassign(usuario(OTRO, "SUPERVISOR"), lead)).toBeNull();
  });

  it("Vendedor nunca puede reasignar (motivo rol)", () => {
    const lead: LeadReasignacion = { asesorId: ASESOR_A, vendedorId: null, semaforo: "ROJO" };
    expect(canReassign(usuario(OTRO, "VENDEDOR"), lead)).toBe("rol");
  });

  it("Asesor sin relacion con el lead no puede reasignar (motivo no_es_titular)", () => {
    const lead: LeadReasignacion = { asesorId: ASESOR_A, vendedorId: null, semaforo: "ROJO" };
    expect(canReassign(usuario(OTRO, "ASESOR"), lead)).toBe("no_es_titular");
  });

  it("prueba obligatoria 3: asesor titular con semaforo verde no puede reasignar (403)", () => {
    const lead: LeadReasignacion = { asesorId: ASESOR_A, vendedorId: null, semaforo: "VERDE" };
    expect(canReassign(usuario(ASESOR_A, "ASESOR"), lead)).toBe("semaforo_verde");
  });

  it.each<Semaforo | null>(["ROJO", "AMARILLO", null])(
    "asesor titular con semaforo %s puede reasignar (DD6: null no bloquea)",
    (semaforo) => {
      const lead: LeadReasignacion = { asesorId: ASESOR_A, vendedorId: null, semaforo };
      expect(canReassign(usuario(ASESOR_A, "ASESOR"), lead)).toBeNull();
    },
  );
});

describe("services/leads.access — canTransfer (M6, DD9/D8)", () => {
  it("prueba obligatoria 10a: etapa NUEVO no es traspasable para NADIE, ni siquiera Administrador", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: null, etapa: "NUEVO" };
    expect(canTransfer(usuario(OTRO, "ADMINISTRADOR"), lead)).toBe("etapa_no_traspasable");
    expect(canTransfer(usuario(ASESOR_A, "ASESOR"), lead)).toBe("etapa_no_traspasable");
  });

  it.each<EtapaLead>(["CONTACTADO", "CITA"])(
    "prueba obligatoria 10b: Administrador puede traspasar desde %s",
    (etapa) => {
      const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: null, etapa };
      expect(canTransfer(usuario(OTRO, "ADMINISTRADOR"), lead)).toBeNull();
    },
  );

  it("Supervisor puede traspasar cualquier lead abierto en etapa distinta de NUEVO", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: null, etapa: "CONTACTADO" };
    expect(canTransfer(usuario(OTRO, "SUPERVISOR"), lead)).toBeNull();
  });

  it("Vendedor nunca puede traspasar (motivo rol)", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: null, etapa: "CONTACTADO" };
    expect(canTransfer(usuario(OTRO, "VENDEDOR"), lead)).toBe("rol");
  });

  it("Asesor titular puede traspasar su propio lead desde CONTACTADO", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: null, etapa: "CONTACTADO" };
    expect(canTransfer(usuario(ASESOR_A, "ASESOR"), lead)).toBeNull();
  });

  it("Asesor sin relacion con el lead no puede traspasar (motivo no_es_titular)", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: null, etapa: "CONTACTADO" };
    expect(canTransfer(usuario(OTRO, "ASESOR"), lead)).toBe("no_es_titular");
  });

  it("prueba obligatoria 13: tras un traspaso, el asesor origen sigue siendo titular para volver a traspasar", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: "vendedor-v", etapa: "CITA" };
    expect(canTransfer(usuario(ASESOR_A, "ASESOR"), lead)).toBeNull();
  });
});
