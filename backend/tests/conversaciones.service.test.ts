import { afterAll, describe, expect, it } from "vitest";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { listConversaciones } from "../src/services/whatsappMessages/conversaciones.service.js";
import type { UsuarioAccesoConversacion } from "../src/services/whatsappMessages/conversaciones.access.js";

let contador = 0;

/**
 * `WhatsAppConexion.empresaId` es `@unique` (una conexión por empresa) — cada
 * test de este archivo crea su propia `Empresa` (mismo criterio que
 * `usuarios.routes.test.ts`) para no colisionar entre casos ni con fixtures
 * de otros archivos.
 */
async function crearEmpresaConConexion(): Promise<{ empresaId: string; conexionId: string }> {
  contador += 1;
  const empresa = await testAdminPrisma.empresa.create({
    data: { nombre: `Empresa Conversaciones ${contador}-${Date.now()}` },
  });
  const conexion = await testAdminPrisma.whatsAppConexion.create({
    data: {
      empresaId: empresa.id,
      numeroTelefonoId: `numero-telefono-${contador}-${Date.now()}`,
      numeroDisplay: `+100000000${contador}`,
      wabaId: `waba-${contador}`,
      estado: "ACTIVA",
    },
  });
  return { empresaId: empresa.id, conexionId: conexion.id };
}

async function crearCliente(nombre: string): Promise<{ id: string }> {
  contador += 1;
  return testAdminPrisma.cliente.create({
    data: { nombre: `${nombre} ${contador}`, telefonoValido: false },
  });
}

async function crearUsuario(rol: "ASESOR" | "ADMINISTRADOR"): Promise<{ id: string }> {
  contador += 1;
  return testAdminPrisma.usuario.create({
    data: {
      nombre: `Usuario Conversaciones ${contador}`,
      correo: `usuario-conversaciones-${contador}-${Date.now()}@integracion.test`,
      passwordHash: "hash-no-usado",
      rol,
      activo: true,
    },
  });
}

async function crearConversacion(params: {
  clienteId: string;
  conexionId: string;
  empresaId: string;
  asesorId: string | null;
}): Promise<{ id: string }> {
  return testAdminPrisma.conversacion.create({
    data: {
      clienteId: params.clienteId,
      conexionId: params.conexionId,
      empresaId: params.empresaId,
      asesorId: params.asesorId,
      ultimoMensajeEn: new Date(),
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

/**
 * Hotfix: `GET /conversaciones?clienteId=...` — resuelve qué conversación
 * abrir desde el detalle de un lead. El caso que realmente importa (b, abajo)
 * es de seguridad: `clienteId` es un filtro ADITIVO, nunca puede ampliar lo
 * que el RBAC existente ya deniega.
 */
describe("services/whatsappMessages/conversaciones.service — listConversaciones filtro clienteId (hotfix)", () => {
  it("(a) con clienteId, devuelve solo la conversación de ese cliente, no otra de la misma empresa", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const clienteObjetivo = await crearCliente("Cliente Objetivo");
    const otroCliente = await crearCliente("Otro Cliente");
    const admin = await crearUsuario("ADMINISTRADOR");

    const conversacionObjetivo = await crearConversacion({
      clienteId: clienteObjetivo.id,
      conexionId,
      empresaId,
      asesorId: null,
    });
    await crearConversacion({ clienteId: otroCliente.id, conexionId, empresaId, asesorId: null });

    const actor: UsuarioAccesoConversacion = { id: admin.id, rol: "ADMINISTRADOR", empresaId };

    const resultado = await runWithTenantContext({ empresaId }, () =>
      listConversaciones(actor, { pagina: 1, limite: 25, clienteId: clienteObjetivo.id }),
    );

    expect(resultado.total).toBe(1);
    expect(resultado.conversaciones).toHaveLength(1);
    expect(resultado.conversaciones[0].id).toBe(conversacionObjetivo.id);
  });

  it("(b) caso de seguridad: un asesor no ve, vía clienteId, la conversación de OTRO asesor aunque el clienteId sea válido y exista en su propia empresa", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const clienteAjeno = await crearCliente("Cliente De Otro Asesor");
    const asesorDueno = await crearUsuario("ASESOR");
    const asesorIntruso = await crearUsuario("ASESOR");

    await crearConversacion({
      clienteId: clienteAjeno.id,
      conexionId,
      empresaId,
      asesorId: asesorDueno.id,
    });

    const intruso: UsuarioAccesoConversacion = { id: asesorIntruso.id, rol: "ASESOR", empresaId };

    const resultado = await runWithTenantContext({ empresaId }, () =>
      listConversaciones(intruso, { pagina: 1, limite: 25, clienteId: clienteAjeno.id }),
    );

    expect(resultado.total).toBe(0);
    expect(resultado.conversaciones).toHaveLength(0);
  });

  it("triangulación: el mismo asesor SÍ ve su propia conversación filtrando por ese clienteId (clienteId es aditivo, no reemplaza el scope RBAC)", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const clientePropio = await crearCliente("Cliente Propio");
    const asesor = await crearUsuario("ASESOR");

    const conversacionPropia = await crearConversacion({
      clienteId: clientePropio.id,
      conexionId,
      empresaId,
      asesorId: asesor.id,
    });

    const actor: UsuarioAccesoConversacion = { id: asesor.id, rol: "ASESOR", empresaId };

    const resultado = await runWithTenantContext({ empresaId }, () =>
      listConversaciones(actor, { pagina: 1, limite: 25, clienteId: clientePropio.id }),
    );

    expect(resultado.total).toBe(1);
    expect(resultado.conversaciones[0].id).toBe(conversacionPropia.id);
  });

  it("sin clienteId, el comportamiento de listado previo no cambia (mismo scope RBAC, sin filtro adicional)", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const clienteUno = await crearCliente("Cliente Uno");
    const clienteDos = await crearCliente("Cliente Dos");
    const admin = await crearUsuario("ADMINISTRADOR");

    await crearConversacion({ clienteId: clienteUno.id, conexionId, empresaId, asesorId: null });
    await crearConversacion({ clienteId: clienteDos.id, conexionId, empresaId, asesorId: null });

    const actor: UsuarioAccesoConversacion = { id: admin.id, rol: "ADMINISTRADOR", empresaId };

    const resultado = await runWithTenantContext({ empresaId }, () =>
      listConversaciones(actor, { pagina: 1, limite: 25 }),
    );

    expect(resultado.total).toBe(2);
  });
});
