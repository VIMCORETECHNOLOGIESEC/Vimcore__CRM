import type { RolUsuario } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  canReply,
  canView,
  ROLES_ACCESO_TOTAL,
  type ConversacionAcceso,
  type UsuarioAccesoConversacion,
} from "../src/services/whatsappMessages/conversaciones.access.js";

function usuario(id: string, rol: RolUsuario, empresaId: string | null = EMPRESA_A): UsuarioAccesoConversacion {
  return { id, rol, empresaId };
}

const ASESOR_A = "asesor-a";
const OTRO = "usuario-sin-relacion";
const EMPRESA_A = "empresa-a";
const EMPRESA_B = "empresa-b";

describe("services/whatsappMessages/conversaciones.access — canView/canReply (mismo criterio que canEdit de leads.access.ts)", () => {
  it("Administrador puede ver/responder cualquier conversación de su empresa, sin ser el asesor asignado", () => {
    const conversacion: ConversacionAcceso = { asesorId: ASESOR_A, empresaId: EMPRESA_A };
    expect(canView(usuario(OTRO, "ADMINISTRADOR"), conversacion)).toBe(true);
    expect(canReply(usuario(OTRO, "ADMINISTRADOR"), conversacion)).toBe(true);
  });

  it("Vendedor nunca tiene acceso (WhatsApp es mensajería asesor↔cliente, D-mensajería)", () => {
    const conversacion: ConversacionAcceso = { asesorId: ASESOR_A, empresaId: EMPRESA_A };
    expect(canView(usuario(OTRO, "VENDEDOR"), conversacion)).toBe(false);
  });

  it("Asesor sin relación con la conversación no tiene acceso", () => {
    const conversacion: ConversacionAcceso = { asesorId: ASESOR_A, empresaId: EMPRESA_A };
    expect(canView(usuario(OTRO, "ASESOR"), conversacion)).toBe(false);
  });

  it("un Administrador de otra empresa no puede ver una conversación de la Empresa A (compuerta de empresa corta primero)", () => {
    const conversacion: ConversacionAcceso = { asesorId: ASESOR_A, empresaId: EMPRESA_A };
    expect(canView(usuario(OTRO, "ADMINISTRADOR", EMPRESA_B), conversacion)).toBe(false);
  });
});

describe("services/whatsappMessages/conversaciones.access — bypass holding-wide SUPERVISOR_HOLDING/SUPER_ADMIN (Bloque F, aditivo)", () => {
  it("ROLES_ACCESO_TOTAL incluye SUPERVISOR_HOLDING y SUPER_ADMIN (usado también por conversaciones.service.ts::listConversaciones)", () => {
    expect(ROLES_ACCESO_TOTAL).toContain("SUPERVISOR_HOLDING");
    expect(ROLES_ACCESO_TOTAL).toContain("SUPER_ADMIN");
  });

  it("canView: SUPERVISOR_HOLDING ve cualquier conversación, sin ser el asesor asignado", () => {
    const conversacion: ConversacionAcceso = { asesorId: ASESOR_A, empresaId: EMPRESA_A };
    expect(canView(usuario(OTRO, "SUPERVISOR_HOLDING", null), conversacion)).toBe(true);
  });

  it("canView: SUPER_ADMIN ve cualquier conversación (triangulación: segundo rol holding-wide distinto)", () => {
    const conversacion: ConversacionAcceso = { asesorId: ASESOR_A, empresaId: EMPRESA_A };
    expect(canView(usuario(OTRO, "SUPER_ADMIN", null), conversacion)).toBe(true);
  });

  it("canReply: SUPERVISOR_HOLDING/SUPER_ADMIN pueden responder cualquier conversación (canReply === canView)", () => {
    const conversacion: ConversacionAcceso = { asesorId: ASESOR_A, empresaId: EMPRESA_A };
    expect(canReply(usuario(OTRO, "SUPERVISOR_HOLDING", null), conversacion)).toBe(true);
    expect(canReply(usuario(OTRO, "SUPER_ADMIN", null), conversacion)).toBe(true);
  });
});
