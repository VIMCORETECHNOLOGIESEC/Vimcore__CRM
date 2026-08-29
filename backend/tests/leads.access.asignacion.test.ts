import type { EtapaLead, RolUsuario, Semaforo } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  canClose,
  canReassign,
  canTransfer,
  type LeadCierre,
  type LeadReasignacion,
  type LeadTraspaso,
  type UsuarioAcceso,
} from "../src/services/leads.access.js";

function usuario(id: string, rol: RolUsuario, empresaId: string | null = EMPRESA_A): UsuarioAcceso {
  return { id, rol, empresaId };
}

const ASESOR_A = "asesor-a";
const OTRO = "usuario-sin-relacion";
const EMPRESA_A = "empresa-a";
const EMPRESA_B = "empresa-b";

describe("services/leads.access — canReassign (M6, DD9/D8/DD6)", () => {
  it("Administrador puede reasignar cualquier lead, semaforo verde incluido", () => {
    const lead: LeadReasignacion = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, semaforo: "VERDE" };
    expect(canReassign(usuario(OTRO, "ADMINISTRADOR"), lead)).toBeNull();
  });

  it("Supervisor puede reasignar cualquier lead, semaforo verde incluido", () => {
    const lead: LeadReasignacion = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, semaforo: "VERDE" };
    expect(canReassign(usuario(OTRO, "SUPERVISOR"), lead)).toBeNull();
  });

  it("Vendedor nunca puede reasignar (motivo rol)", () => {
    const lead: LeadReasignacion = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, semaforo: "ROJO" };
    expect(canReassign(usuario(OTRO, "VENDEDOR"), lead)).toBe("rol");
  });

  it("Asesor sin relacion con el lead no puede reasignar (motivo no_es_titular)", () => {
    const lead: LeadReasignacion = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, semaforo: "ROJO" };
    expect(canReassign(usuario(OTRO, "ASESOR"), lead)).toBe("no_es_titular");
  });

  it("prueba obligatoria 3: asesor titular con semaforo verde no puede reasignar (403)", () => {
    const lead: LeadReasignacion = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, semaforo: "VERDE" };
    expect(canReassign(usuario(ASESOR_A, "ASESOR"), lead)).toBe("semaforo_verde");
  });

  it.each<Semaforo | null>(["ROJO", "AMARILLO", null])(
    "asesor titular con semaforo %s puede reasignar (DD6: null no bloquea)",
    (semaforo) => {
      const lead: LeadReasignacion = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, semaforo };
      expect(canReassign(usuario(ASESOR_A, "ASESOR"), lead)).toBeNull();
    },
  );
});

describe("services/leads.access — canTransfer (M6, DD9/D8)", () => {
  it("prueba obligatoria 10a: etapa NUEVO no es traspasable para NADIE, ni siquiera Administrador", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, etapa: "NUEVO" };
    expect(canTransfer(usuario(OTRO, "ADMINISTRADOR"), lead)).toBe("etapa_no_traspasable");
    expect(canTransfer(usuario(ASESOR_A, "ASESOR"), lead)).toBe("etapa_no_traspasable");
  });

  it.each<EtapaLead>(["CONTACTADO", "CITA"])(
    "prueba obligatoria 10b: Administrador puede traspasar desde %s",
    (etapa) => {
      const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, etapa };
      expect(canTransfer(usuario(OTRO, "ADMINISTRADOR"), lead)).toBeNull();
    },
  );

  it("D4: Administrador/Supervisor re-traspasan un lead ya traspasado (vendedorId != null) sin restricción", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: "vendedor-v", empresaId: EMPRESA_A, etapa: "CITA" };
    expect(canTransfer(usuario(OTRO, "ADMINISTRADOR"), lead)).toBeNull();
    expect(canTransfer(usuario(OTRO, "SUPERVISOR"), lead)).toBeNull();
  });

  it("Supervisor puede traspasar cualquier lead abierto en etapa distinta de NUEVO", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, etapa: "CONTACTADO" };
    expect(canTransfer(usuario(OTRO, "SUPERVISOR"), lead)).toBeNull();
  });

  it("Vendedor nunca puede traspasar (motivo rol)", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, etapa: "CONTACTADO" };
    expect(canTransfer(usuario(OTRO, "VENDEDOR"), lead)).toBe("rol");
  });

  it("Asesor titular puede traspasar su propio lead desde CONTACTADO (vendedorId: null es load-bearing — un solo traspaso disponible)", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, etapa: "CONTACTADO" };
    expect(canTransfer(usuario(ASESOR_A, "ASESOR"), lead)).toBeNull();
  });

  it("Asesor sin relacion con el lead no puede traspasar (motivo no_es_titular)", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, etapa: "CONTACTADO" };
    expect(canTransfer(usuario(OTRO, "ASESOR"), lead)).toBe("no_es_titular");
  });

  it("prueba obligatoria 13 (corregida — supersede el bug P0 docs/06): un lead ya traspasado (vendedorId != null) NO puede volver a ser traspasado por el asesor origen", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: "vendedor-v", empresaId: EMPRESA_A, etapa: "CITA" };
    expect(canTransfer(usuario(ASESOR_A, "ASESOR"), lead)).toBe("ya_traspasado");
  });

  it("prueba de triangulación: un ASESOR ajeno (no titular) sobre un lead ya traspasado sigue denegado por no_es_titular, no por ya_traspasado", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: "vendedor-v", empresaId: EMPRESA_A, etapa: "CITA" };
    expect(canTransfer(usuario(OTRO, "ASESOR"), lead)).toBe("no_es_titular");
  });
});

describe("services/leads.access — canClose responsable operativo (companion, D1-D3, memoria #82)", () => {
  const VENDEDOR_V = "vendedor-v";

  it("vendedorId ausente: el responsable operativo de cierre es el propio asesor titular", () => {
    const lead: LeadCierre = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, etapa: "CONTACTADO" };
    expect(canClose(usuario(ASESOR_A, "ASESOR"), lead)).toBeNull();
  });

  it("vendedorId presente: el responsable operativo de cierre pasa a ser el vendedor, no el asesor origen", () => {
    const lead: LeadCierre = { asesorId: ASESOR_A, vendedorId: VENDEDOR_V, empresaId: EMPRESA_A, etapa: "CONTACTADO" };
    expect(canClose(usuario(ASESOR_A, "ASESOR"), lead)).toBe("no_es_titular");
    expect(canClose(usuario(VENDEDOR_V, "VENDEDOR"), lead)).toBeNull();
  });
});

describe("services/leads.access — canReassign/canTransfer aislamiento entre empresas (Bloque C, Fase 2/Stage 2)", () => {
  it("canReassign: Administrador de la Empresa B no puede reasignar un lead de la Empresa A (motivo no_es_titular, sin fuga)", () => {
    const lead: LeadReasignacion = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, semaforo: "ROJO" };
    expect(canReassign(usuario(OTRO, "ADMINISTRADOR", EMPRESA_B), lead)).toBe("no_es_titular");
  });

  it("canReassign: Administrador holding-wide (empresaId null) sigue reasignando cualquier empresa (D2, sin restricción nueva)", () => {
    const lead: LeadReasignacion = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, semaforo: "VERDE" };
    expect(canReassign(usuario(OTRO, "ADMINISTRADOR", null), lead)).toBeNull();
  });

  it("canTransfer: compuerta de empresa corta ANTES que la compuerta de etapa — NUEVO de la Empresa A no se filtra a un Administrador de la Empresa B", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, etapa: "NUEVO" };
    expect(canTransfer(usuario(OTRO, "ADMINISTRADOR", EMPRESA_B), lead)).toBe("no_es_titular");
  });

  it("canTransfer: Asesor titular (mismo id) pero de OTRA empresa no puede traspasar (empresaId manda sobre titularidad)", () => {
    const lead: LeadTraspaso = { asesorId: ASESOR_A, vendedorId: null, empresaId: EMPRESA_A, etapa: "CONTACTADO" };
    expect(canTransfer(usuario(ASESOR_A, "ASESOR", EMPRESA_B), lead)).toBe("no_es_titular");
  });
});
