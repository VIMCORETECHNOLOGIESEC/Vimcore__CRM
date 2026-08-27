import { randomUUID } from "node:crypto";
import type { RolMembresia } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import * as notificacionRepository from "../src/repositories/notificacion.repository.js";

/**
 * Bloque C (Fase 1 / Stage 1, spec company-isolation, D5): corrige el
 * chokepoint de notificaciones — `findActiveRecipientIds` pasa de escanear
 * `Usuario.rol` globalmente a resolver por `Membresia` (empresaId + rol).
 * Repositorio golpea la BD real de pruebas, mismo patrón que
 * `membresia.repository.test.ts`.
 */
const BOOTSTRAP_EMPRESA_ID = "00000000-0000-0000-0000-000000000001";

async function crearUsuarioConMembresia(
  empresaId: string,
  rolMembresia: RolMembresia,
  overrides: {
    habilitadoParaVenta?: boolean;
    usuarioActivo?: boolean;
    membresiaActiva?: boolean;
  } = {},
) {
  const usuario = await prisma.usuario.create({
    data: {
      nombre: "Destinatario Notificacion",
      correo: `destinatario-${randomUUID()}@t.local`,
      passwordHash: "x",
      rol: "ASESOR",
      activo: overrides.usuarioActivo ?? true,
    },
  });
  await prisma.membresia.create({
    data: {
      usuarioId: usuario.id,
      empresaId,
      rol: rolMembresia,
      habilitadoParaVenta: overrides.habilitadoParaVenta ?? false,
      activa: overrides.membresiaActiva ?? true,
    },
  });
  return usuario;
}

describe("repositories/notificacion — findActiveRecipientIds (Bloque C, D5, chokepoint fix)", () => {
  it("Scenario 'No cross-company recipient': resuelve por Membresia empresaId+rol, sin incluir otra empresa", async () => {
    // Empresas dedicadas (no `BOOTSTRAP_EMPRESA_ID`) para una igualdad EXACTA
    // — la BD de pruebas es compartida entre archivos (sin truncar por
    // archivo, `tests/setup.ts`) y varios otros archivos siembran
    // Membresias ADMINISTRADOR sobre `BOOTSTRAP_EMPRESA_ID`.
    const empresaA = await prisma.empresa.create({ data: { nombre: `Empresa A ${randomUUID()}` } });
    const empresaB = await prisma.empresa.create({ data: { nombre: `Empresa B ${randomUUID()}` } });
    const adminEmpresaA = await crearUsuarioConMembresia(empresaA.id, "ADMINISTRADOR");
    await crearUsuarioConMembresia(empresaB.id, "ADMINISTRADOR");

    const destinatarios = await notificacionRepository.findActiveRecipientIds(
      ["ADMINISTRADOR"],
      empresaA.id,
    );

    expect(destinatarios).toEqual([adminEmpresaA.id]);
  });

  it("empresaId=null (holding-wide, D2) incluye destinatarios de cualquier empresa", async () => {
    const empresaB = await prisma.empresa.create({ data: { nombre: `Empresa B ${randomUUID()}` } });
    const adminA = await crearUsuarioConMembresia(BOOTSTRAP_EMPRESA_ID, "ADMINISTRADOR");
    const adminB = await crearUsuarioConMembresia(empresaB.id, "ADMINISTRADOR");

    const destinatarios = await notificacionRepository.findActiveRecipientIds(["ADMINISTRADOR"], null);

    expect(destinatarios).toEqual(expect.arrayContaining([adminA.id, adminB.id]));
  });

  it("VENDEDOR legado mapea a Membresia ASESOR+habilitadoParaVenta=true, nunca al ASESOR sin habilitar", async () => {
    const vendedor = await crearUsuarioConMembresia(BOOTSTRAP_EMPRESA_ID, "ASESOR", {
      habilitadoParaVenta: true,
    });
    const asesorSinVenta = await crearUsuarioConMembresia(BOOTSTRAP_EMPRESA_ID, "ASESOR", {
      habilitadoParaVenta: false,
    });

    const destinatarios = await notificacionRepository.findActiveRecipientIds(
      ["VENDEDOR"],
      BOOTSTRAP_EMPRESA_ID,
    );

    expect(destinatarios).toContain(vendedor.id);
    expect(destinatarios).not.toContain(asesorSinVenta.id);
  });

  it("excluye una Membresia dada de baja (activa=false)", async () => {
    const inactivo = await crearUsuarioConMembresia(BOOTSTRAP_EMPRESA_ID, "SUPERVISOR", {
      membresiaActiva: false,
    });

    const destinatarios = await notificacionRepository.findActiveRecipientIds(
      ["SUPERVISOR"],
      BOOTSTRAP_EMPRESA_ID,
    );

    expect(destinatarios).not.toContain(inactivo.id);
  });

  it("excluye un Usuario dado de baja (activo=false) aunque su Membresia siga activa (D5, cross-check)", async () => {
    const inactivo = await crearUsuarioConMembresia(BOOTSTRAP_EMPRESA_ID, "SUPERVISOR", {
      usuarioActivo: false,
    });

    const destinatarios = await notificacionRepository.findActiveRecipientIds(
      ["SUPERVISOR"],
      BOOTSTRAP_EMPRESA_ID,
    );

    expect(destinatarios).not.toContain(inactivo.id);
  });

  it("sin roles solicitados: no consulta la BD y devuelve arreglo vacío", async () => {
    const destinatarios = await notificacionRepository.findActiveRecipientIds([], BOOTSTRAP_EMPRESA_ID);
    expect(destinatarios).toEqual([]);
  });

  it("dedupe: un usuario con dos Membresias que matchean roles solicitados aparece una sola vez", async () => {
    const empresaB = await prisma.empresa.create({ data: { nombre: `Empresa B dedupe ${randomUUID()}` } });
    const usuario = await crearUsuarioConMembresia(BOOTSTRAP_EMPRESA_ID, "ADMINISTRADOR");
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: empresaB.id, rol: "SUPERVISOR", activa: true },
    });

    const destinatarios = await notificacionRepository.findActiveRecipientIds(
      ["ADMINISTRADOR", "SUPERVISOR"],
      null,
    );

    expect(destinatarios.filter((id) => id === usuario.id)).toHaveLength(1);
  });
});
