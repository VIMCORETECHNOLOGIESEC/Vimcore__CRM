import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { procesarMensajeEntrante } from "../src/services/whatsappMessages/whatsapp-ruteo.service.js";
import type { WhatsAppMensajeEntrante } from "../src/types/whatsappMessages/whatsapp-mensaje-entrante.js";

/**
 * Fix (campanita de notificaciones para mensajes de WhatsApp, 2026-09-01):
 * `procesarMensajeEntrante` crea una `Notificacion` de tipo
 * `WHATSAPP_MENSAJE_NUEVO` (además del evento SSE silencioso ya cubierto
 * indirectamente por otros tests) para el asesor asignado a la conversación
 * y para ADMINISTRADOR/SUPERVISOR activos de la empresa — mismo criterio de
 * destinatarios que `eventosMensaje` (ver comentario en el servicio). Este
 * archivo no existía antes: `whatsapp-ruteo.service.ts` no tenía NINGÚN test
 * dedicado, así que estos casos cubren específicamente la persistencia de
 * `Notificacion` (lo único que faltaba antes de este commit), no todo el
 * árbol de decisión de ruteo (ya cubierto indirectamente por
 * `deduplicacion.decider.test.ts`/`lead.repository.test.ts`).
 *
 * Patrón de fixtures: mismo criterio que `conversaciones.service.test.ts`
 * (empresa+conexión dedicada por caso, vía `testAdminPrisma`, `WhatsAppConexion.
 * empresaId` es `@unique`) y `notificacion.repository.test.ts` (Membresia
 * activa+rol para resolver destinatarios de gestión). Los casos que necesitan
 * un `Lead` ya ABIERTO (rule 2: "ya tiene un Lead con asesor asignado -> rutea
 * a ese asesor") crean el `Cliente`/`Lead` directo por fixture para no
 * depender del pool de asignación automática (`assignAfterCommit`, M6) — el
 * único caso que sí atraviesa esa vía (D, lead nuevo) lo hace deliberadamente
 * sin ningún ASESOR elegible en el pool de esa empresa, así
 * `assignAutomatically` resuelve `sin_candidatos` de forma inocua (mismo
 * comportamiento ya cubierto en `asignacion.service.test.ts`) y no interfiere
 * con las aserciones de este archivo.
 */
let contador = 0;

async function crearEmpresaConConexion(): Promise<{ empresaId: string; conexionId: string }> {
  contador += 1;
  const empresa = await testAdminPrisma.empresa.create({
    data: { nombre: `Empresa Ruteo Notificacion ${contador}-${Date.now()}` },
  });
  const conexion = await testAdminPrisma.whatsAppConexion.create({
    data: {
      empresaId: empresa.id,
      numeroTelefonoId: `numero-telefono-ruteo-${contador}-${Date.now()}`,
      numeroDisplay: `+1000000${contador}`,
      wabaId: `waba-ruteo-${contador}`,
      estado: "ACTIVA",
    },
  });
  return { empresaId: empresa.id, conexionId: conexion.id };
}

async function crearUsuario(rol: "ASESOR" | "ADMINISTRADOR" | "SUPERVISOR"): Promise<{ id: string }> {
  contador += 1;
  return testAdminPrisma.usuario.create({
    data: {
      nombre: `Usuario Ruteo Notificacion ${contador}`,
      correo: `usuario-ruteo-notificacion-${contador}-${Date.now()}@integracion.test`,
      passwordHash: "hash-no-usado",
      rol,
      activo: true,
    },
  });
}

async function crearMembresia(
  usuarioId: string,
  empresaId: string,
  rol: "ADMINISTRADOR" | "SUPERVISOR",
  activa = true,
): Promise<void> {
  await testAdminPrisma.membresia.create({ data: { usuarioId, empresaId, rol, activa } });
}

/**
 * Número EC móvil válido y único por caso (`normalizeTelefono`, país por
 * defecto EC): `9` + 8 dígitos con padding, mismo prefijo `593` que ya usan
 * los fixtures de M4/M5 (nunca colisiona con los prefijos `097`/`098`/`099`
 * ya reservados por otros archivos, ver `ingesta.service.test.ts`). Se
 * devuelve sin "+" (formato que entrega Meta, ver `normalizarWaId`).
 */
function waIdUnico(): string {
  contador += 1;
  return `593${9}${String(contador).padStart(8, "0")}`;
}

async function crearClienteConLeadAbierto(
  empresaId: string,
  asesorId: string | null,
  ahora: Date,
): Promise<{ clienteId: string; nombre: string; waId: string }> {
  contador += 1;
  const waId = waIdUnico();
  const telefonoNormalizado = `+${waId}`;
  const nombre = `Cliente Ruteo ${contador}`;
  const cliente = await testAdminPrisma.cliente.create({
    data: {
      nombre,
      telefonoOriginal: telefonoNormalizado,
      telefonoNormalizado,
      telefonoValido: true,
      creadoEn: ahora,
    },
  });
  await testAdminPrisma.lead.create({
    data: {
      clienteId: cliente.id,
      empresaId,
      origen: "NUEVO",
      etapa: "NUEVO",
      redSocial: "WHATSAPP",
      ingresadoEn: ahora,
      asesorId,
    },
  });
  return { clienteId: cliente.id, nombre, waId };
}

function entranteBase(waId: string, overrides: Partial<WhatsAppMensajeEntrante> = {}): WhatsAppMensajeEntrante {
  contador += 1;
  return {
    numeroTelefonoId: `numero-telefono-mensaje-${contador}`,
    waId,
    nombrePerfil: "Nombre De Perfil Meta",
    wamid: `wamid-ruteo-${contador}-${randomUUID()}`,
    texto: "Hola, quiero información",
    enviadoEn: new Date(),
    payloadOriginal: { raw: true },
    ...overrides,
  };
}

async function notificacionesWhatsapp(empresaId: string) {
  return testAdminPrisma.notificacion.findMany({
    where: { tipo: "WHATSAPP_MENSAJE_NUEVO", empresaId },
    orderBy: { creadaEn: "asc" },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

describe("services/whatsappMessages/whatsapp-ruteo — Notificacion WHATSAPP_MENSAJE_NUEVO (campanita, 2026-09-01)", () => {
  it("(a) crea una Notificacion para el asesor asignado y para ADMINISTRADOR/SUPERVISOR activos de la empresa", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const asesor = await crearUsuario("ASESOR");
    const admin = await crearUsuario("ADMINISTRADOR");
    const supervisor = await crearUsuario("SUPERVISOR");
    await crearMembresia(admin.id, empresaId, "ADMINISTRADOR");
    await crearMembresia(supervisor.id, empresaId, "SUPERVISOR");

    const ahora = new Date("2026-09-01T12:00:00.000Z");
    const { clienteId, nombre, waId } = await crearClienteConLeadAbierto(empresaId, asesor.id, ahora);
    const entrante = entranteBase(waId, { texto: "Hola, quiero información" });

    await runWithTenantContext({ empresaId }, () =>
      procesarMensajeEntrante(entrante, { id: conexionId, empresaId }, ahora),
    );

    const conversacion = await testAdminPrisma.conversacion.findFirstOrThrow({
      where: { clienteId, conexionId },
    });
    const notificaciones = await notificacionesWhatsapp(empresaId);

    expect(notificaciones).toHaveLength(3);
    const destinatarios = notificaciones.map((n) => n.usuarioId).sort();
    expect(destinatarios).toEqual([asesor.id, admin.id, supervisor.id].sort());
    for (const notificacion of notificaciones) {
      expect(notificacion.titulo).toBe("Nuevo mensaje de WhatsApp");
      expect(notificacion.mensaje).toBe(`${nombre} escribió: "Hola, quiero información"`);
      expect(notificacion.empresaId).toBe(empresaId);
      expect(notificacion.metadata).toEqual({ conversacionId: conversacion.id });
    }
  });

  it("(b) triangulación — texto null (tipo de mensaje no soportado) usa el mensaje genérico, nunca 'null'", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const asesor = await crearUsuario("ASESOR");
    const admin = await crearUsuario("ADMINISTRADOR");
    await crearMembresia(admin.id, empresaId, "ADMINISTRADOR");

    const ahora = new Date("2026-09-01T12:05:00.000Z");
    const { waId } = await crearClienteConLeadAbierto(empresaId, asesor.id, ahora);
    const entrante = entranteBase(waId, { texto: null });

    await runWithTenantContext({ empresaId }, () =>
      procesarMensajeEntrante(entrante, { id: conexionId, empresaId }, ahora),
    );

    const notificaciones = await notificacionesWhatsapp(empresaId);
    expect(notificaciones).toHaveLength(2);
    for (const notificacion of notificaciones) {
      expect(notificacion.titulo).toBe("Nuevo mensaje de WhatsApp");
      expect(notificacion.mensaje).toBe("Nuevo mensaje de WhatsApp");
    }
  });

  it("(c) trunca el texto a 80 caracteres con '…' en el mensaje persistido", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const asesor = await crearUsuario("ASESOR");

    const ahora = new Date("2026-09-01T12:10:00.000Z");
    const { nombre, waId } = await crearClienteConLeadAbierto(empresaId, asesor.id, ahora);
    const textoLargo = "x".repeat(100);
    const entrante = entranteBase(waId, { texto: textoLargo });

    await runWithTenantContext({ empresaId }, () =>
      procesarMensajeEntrante(entrante, { id: conexionId, empresaId }, ahora),
    );

    const notificaciones = await notificacionesWhatsapp(empresaId);
    expect(notificaciones).toHaveLength(1);
    const esperado = `${nombre} escribió: "${"x".repeat(80)}…"`;
    expect(notificaciones[0].mensaje).toBe(esperado);
    expect(notificaciones[0].mensaje).not.toContain(textoLargo);
  });

  it("(d) lead nuevo sin asesor todavía asignado: solo ADMINISTRADOR/SUPERVISOR activos reciben la Notificacion, sin entrada para el asesor", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const admin = await crearUsuario("ADMINISTRADOR");
    await crearMembresia(admin.id, empresaId, "ADMINISTRADOR");

    // Sin ASESOR elegible en el pool de esta empresa -- `assignAfterCommit`
    // (M6) resuelve `sin_candidatos` de forma inocua (ver comentario de
    // clase), la conversación/lead quedan sin asesor.
    const ahora = new Date("2026-09-01T12:15:00.000Z");
    const waId = waIdUnico();
    const entrante = entranteBase(waId, { texto: "Primer contacto" });

    await runWithTenantContext({ empresaId }, () =>
      procesarMensajeEntrante(entrante, { id: conexionId, empresaId }, ahora),
    );

    const notificaciones = await notificacionesWhatsapp(empresaId);
    expect(notificaciones).toHaveLength(1);
    expect(notificaciones[0].usuarioId).toBe(admin.id);
  });

  it("(e) empresa sin ADMINISTRADOR/SUPERVISOR activo: solo el asesor asignado recibe la Notificacion", async () => {
    const { empresaId, conexionId } = await crearEmpresaConConexion();
    const asesor = await crearUsuario("ASESOR");
    // Membresia ADMINISTRADOR dada de baja -- no debe recibir nada (mismo
    // criterio que `notificacion.repository.test.ts`, "excluye una Membresia
    // dada de baja").
    const adminInactivo = await crearUsuario("ADMINISTRADOR");
    await crearMembresia(adminInactivo.id, empresaId, "ADMINISTRADOR", false);

    const ahora = new Date("2026-09-01T12:20:00.000Z");
    const { waId } = await crearClienteConLeadAbierto(empresaId, asesor.id, ahora);
    const entrante = entranteBase(waId, { texto: "Consulta de precio" });

    await runWithTenantContext({ empresaId }, () =>
      procesarMensajeEntrante(entrante, { id: conexionId, empresaId }, ahora),
    );

    const notificaciones = await notificacionesWhatsapp(empresaId);
    expect(notificaciones).toHaveLength(1);
    expect(notificaciones[0].usuarioId).toBe(asesor.id);
  });
});
