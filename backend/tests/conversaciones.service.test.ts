import { afterAll, describe, expect, it, vi } from "vitest";
import { eventBroker } from "../src/lib/event-broker.js";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import * as conversacionLecturaRepository from "../src/repositories/whatsappMessages/conversacion-lectura.repository.js";
import {
  listConversaciones,
  marcarConversacionLeida,
} from "../src/services/whatsappMessages/conversaciones.service.js";
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
  // D-mensajería (leído/no leído): opcional -- `null` simula una
  // conversación recién creada, sin mensajes todavía. Default `new Date()`
  // preserva el comportamiento previo de este helper para el resto del
  // archivo.
  ultimoMensajeEn?: Date | null;
}): Promise<{ id: string }> {
  return testAdminPrisma.conversacion.create({
    data: {
      clienteId: params.clienteId,
      conexionId: params.conexionId,
      empresaId: params.empresaId,
      asesorId: params.asesorId,
      ultimoMensajeEn: params.ultimoMensajeEn === undefined ? new Date() : params.ultimoMensajeEn,
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

/**
 * D-mensajería (leído/no leído): watermark por (conversación, usuario) --
 * ver el comentario del modelo `ConversacionLectura` en schema.prisma para
 * el criterio completo. `noLeido` se DERIVA en `listConversaciones`, nunca
 * se persiste por mensaje.
 */
describe("services/whatsappMessages/conversaciones.service — leído/no leído (D-mensajería)", () => {
  it("sin lectura previa: noLeido=true si hay al menos un mensaje", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const cliente = await crearCliente("Cliente");
    const asesor = await crearUsuario("ASESOR");
    const conversacion = await crearConversacion({ clienteId: cliente.id, conexionId, empresaId, asesorId: asesor.id });
    const actor: UsuarioAccesoConversacion = { id: asesor.id, rol: "ASESOR", empresaId };

    const resultado = await runWithTenantContext({ empresaId }, () =>
      listConversaciones(actor, { pagina: 1, limite: 25 }),
    );

    expect(resultado.conversaciones.find((c) => c.id === conversacion.id)?.noLeido).toBe(true);
  });

  it("conversación recién creada sin mensajes todavía: nunca noLeido, aunque nadie la haya marcado como leída", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const cliente = await crearCliente("Cliente Sin Mensajes");
    const asesor = await crearUsuario("ASESOR");
    const conversacion = await crearConversacion({
      clienteId: cliente.id,
      conexionId,
      empresaId,
      asesorId: asesor.id,
      ultimoMensajeEn: null,
    });
    const actor: UsuarioAccesoConversacion = { id: asesor.id, rol: "ASESOR", empresaId };

    const resultado = await runWithTenantContext({ empresaId }, () =>
      listConversaciones(actor, { pagina: 1, limite: 25 }),
    );

    expect(resultado.conversaciones.find((c) => c.id === conversacion.id)?.noLeido).toBe(false);
  });

  it("marcarConversacionLeida apaga noLeido para ESE usuario, sin tocar el Mensaje ni la Conversacion", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const cliente = await crearCliente("Cliente");
    const asesor = await crearUsuario("ASESOR");
    const conversacion = await crearConversacion({ clienteId: cliente.id, conexionId, empresaId, asesorId: asesor.id });
    const actor: UsuarioAccesoConversacion = { id: asesor.id, rol: "ASESOR", empresaId };

    await runWithTenantContext({ empresaId }, () => marcarConversacionLeida(actor, conversacion.id));

    const resultado = await runWithTenantContext({ empresaId }, () =>
      listConversaciones(actor, { pagina: 1, limite: 25 }),
    );
    expect(resultado.conversaciones.find((c) => c.id === conversacion.id)?.noLeido).toBe(false);
  });

  it("un mensaje nuevo DESPUÉS de marcar como leído vuelve a prender noLeido", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const cliente = await crearCliente("Cliente");
    const asesor = await crearUsuario("ASESOR");
    const conversacion = await crearConversacion({ clienteId: cliente.id, conexionId, empresaId, asesorId: asesor.id });
    const actor: UsuarioAccesoConversacion = { id: asesor.id, rol: "ASESOR", empresaId };

    await runWithTenantContext({ empresaId }, () => marcarConversacionLeida(actor, conversacion.id));
    // Mensaje nuevo posterior a la marca de lectura (mismo criterio que
    // `postMensaje`/`whatsapp-ruteo.service.ts::touchUltimoMensajeEn`, acá
    // escrito directo porque el punto de la prueba es solo el timestamp).
    await testAdminPrisma.conversacion.update({
      where: { id: conversacion.id },
      data: { ultimoMensajeEn: new Date(Date.now() + 1_000) },
    });

    const resultado = await runWithTenantContext({ empresaId }, () =>
      listConversaciones(actor, { pagina: 1, limite: 25 }),
    );
    expect(resultado.conversaciones.find((c) => c.id === conversacion.id)?.noLeido).toBe(true);
  });

  it("el watermark es por USUARIO: el Supervisor marca leído y el badge del Asesor no se apaga", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const cliente = await crearCliente("Cliente");
    const asesor = await crearUsuario("ASESOR");
    const supervisor = await crearUsuario("ADMINISTRADOR");
    const conversacion = await crearConversacion({ clienteId: cliente.id, conexionId, empresaId, asesorId: asesor.id });
    const actorSupervisor: UsuarioAccesoConversacion = { id: supervisor.id, rol: "ADMINISTRADOR", empresaId };
    const actorAsesor: UsuarioAccesoConversacion = { id: asesor.id, rol: "ASESOR", empresaId };

    await runWithTenantContext({ empresaId }, () => marcarConversacionLeida(actorSupervisor, conversacion.id));

    const resultadoAsesor = await runWithTenantContext({ empresaId }, () =>
      listConversaciones(actorAsesor, { pagina: 1, limite: 25 }),
    );
    expect(resultadoAsesor.conversaciones.find((c) => c.id === conversacion.id)?.noLeido).toBe(true);
  });

  it("marcarConversacionLeida publica whatsapp.conversacion-leida por el mismo canal SSE que mensaje-nuevo", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const cliente = await crearCliente("Cliente");
    const asesor = await crearUsuario("ASESOR");
    const conversacion = await crearConversacion({ clienteId: cliente.id, conexionId, empresaId, asesorId: asesor.id });
    const actor: UsuarioAccesoConversacion = { id: asesor.id, rol: "ASESOR", empresaId };

    const publish = vi.spyOn(eventBroker, "publish");
    await runWithTenantContext({ empresaId }, () => marcarConversacionLeida(actor, conversacion.id));

    expect(publish).toHaveBeenCalledWith(
      asesor.id,
      "whatsapp.conversacion-leida",
      expect.objectContaining({ conversacionId: conversacion.id, usuarioId: asesor.id }),
      empresaId,
    );
  });

  it("404 conversacion_no_encontrada: id inexistente", async () => {
    const { empresaId } = await crearEmpresaConConexion();
    const asesor = await crearUsuario("ASESOR");
    const actor: UsuarioAccesoConversacion = { id: asesor.id, rol: "ASESOR", empresaId };

    await expect(
      runWithTenantContext({ empresaId }, () =>
        marcarConversacionLeida(actor, "00000000-0000-0000-0000-000000000000"),
      ),
    ).rejects.toMatchObject({ code: "conversacion_no_encontrada" });
  });

  it("403 permiso_denegado: un asesor no puede marcar como leída la conversación de OTRO asesor", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const cliente = await crearCliente("Cliente");
    const asesorDueno = await crearUsuario("ASESOR");
    const asesorIntruso = await crearUsuario("ASESOR");
    const conversacion = await crearConversacion({
      clienteId: cliente.id,
      conexionId,
      empresaId,
      asesorId: asesorDueno.id,
    });
    const intruso: UsuarioAccesoConversacion = { id: asesorIntruso.id, rol: "ASESOR", empresaId };

    await expect(
      runWithTenantContext({ empresaId }, () => marcarConversacionLeida(intruso, conversacion.id)),
    ).rejects.toMatchObject({ code: "permiso_denegado" });
  });

  it("RLS real: un tenant restringido a la empresa B nunca ve el watermark de un usuario/conversación de la empresa A, aunque los ids sean exactos", async () => {
    const { empresaId: empresaA, conexionId: conexionA } = await crearEmpresaConConexion();
    const { empresaId: empresaB } = await crearEmpresaConConexion();
    const cliente = await crearCliente("Cliente Empresa A");
    const asesorA = await crearUsuario("ASESOR");
    const conversacionA = await crearConversacion({
      clienteId: cliente.id,
      conexionId: conexionA,
      empresaId: empresaA,
      asesorId: asesorA.id,
    });
    const actorA: UsuarioAccesoConversacion = { id: asesorA.id, rol: "ASESOR", empresaId: empresaA };

    await runWithTenantContext({ empresaId: empresaA }, () => marcarConversacionLeida(actorA, conversacionA.id));

    // Confirma que la fila existe de verdad (bypass RLS, vista de admin).
    const filaReal = await testAdminPrisma.conversacionLectura.findFirst({
      where: { conversacionId: conversacionA.id, usuarioId: asesorA.id },
    });
    expect(filaReal).not.toBeNull();

    // Mismo id de usuario y de conversación EXACTOS, pero bajo un
    // tenant context restringido a una empresa distinta -- RLS debe
    // ocultarla igual, no solo el filtro de aplicación (que acá ni
    // siquiera se ejercita: se llama al repositorio directo).
    const desdeOtraEmpresa = await runWithTenantContext({ empresaId: empresaB }, () =>
      conversacionLecturaRepository.findLeidoHastaPorConversaciones(asesorA.id, [conversacionA.id]),
    );
    expect(desdeOtraEmpresa).toHaveLength(0);
  });
});
