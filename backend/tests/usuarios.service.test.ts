import { afterAll, describe, expect, it, vi } from "vitest";
import { eventBroker } from "../src/lib/event-broker.js";
import { prisma } from "../src/lib/prisma.js";
import * as leadRepository from "../src/repositories/lead.repository.js";
import * as usuarioRepository from "../src/repositories/usuario.repository.js";
import { deactivateUsuario } from "../src/services/usuarios.service.js";
import type { EtapaLead, RolUsuario } from "@prisma/client";

let contador = 0;

async function crearCliente(): Promise<{ id: string }> {
  contador += 1;
  return prisma.cliente.create({
    data: { nombre: `Cliente baja usuario ${contador}`, telefonoValido: false },
  });
}

async function crearUsuario(rol: RolUsuario, activo = true): Promise<{ id: string; rol: RolUsuario }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario baja ${contador}`,
      correo: `usuario-baja-${contador}@integracion.test`,
      passwordHash: "hash-no-usado",
      rol,
      activo,
    },
  });
  return { id: usuario.id, rol: usuario.rol };
}

async function crearLead(data: {
  asesorId?: string;
  vendedorId?: string;
  etapa?: EtapaLead;
}): Promise<{ id: string }> {
  const cliente = await crearCliente();
  return prisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: data.etapa ?? "NUEVO",
      ingresadoEn: new Date(),
      asesorId: data.asesorId,
      vendedorId: data.vendedorId,
    },
  });
}

/** Aislamiento (mismo criterio que `asignacion.service.test.ts`): la suite
 * corre archivos de prueba concurrentes contra la misma BD real. */
async function desactivarTodos(rol: RolUsuario): Promise<void> {
  await prisma.usuario.updateMany({ where: { rol }, data: { activo: false } });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("usuarios.service — deactivateUsuario (M2: baja lógica con reasignación obligatoria de cartera activa)", () => {
  it("asesor con cartera abierta y otro asesor activo disponible: baja exitosa, cada lead reasignado con evento REASIGNACION y SSE emitido", async () => {
    await desactivarTodos("ASESOR");

    const victima = await crearUsuario("ASESOR");
    const candidato = await crearUsuario("ASESOR");
    const leadUno = await crearLead({ asesorId: victima.id, etapa: "NUEVO" });
    const leadDos = await crearLead({ asesorId: victima.id, etapa: "CONTACTADO" });

    const publish = vi.spyOn(eventBroker, "publish");

    await deactivateUsuario(victima.id);

    const victimaTrasBaja = await prisma.usuario.findUniqueOrThrow({ where: { id: victima.id } });
    expect(victimaTrasBaja.activo).toBe(false);

    for (const lead of [leadUno, leadDos]) {
      const leadActualizado = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(leadActualizado.asesorId).toBe(candidato.id);

      const evento = await prisma.leadEvento.findFirst({
        where: { leadId: lead.id, tipo: "REASIGNACION" },
      });
      expect(evento).not.toBeNull();
      expect(evento?.detalle).toMatchObject({
        motivo: "baja_usuario",
        responsableId: candidato.id,
        responsableAnteriorId: victima.id,
        ejecutadoPorId: null,
      });
    }

    expect(publish).toHaveBeenCalledWith(
      candidato.id,
      "lead.asignado",
      expect.objectContaining({ leadId: leadUno.id }),
    );
    expect(publish).toHaveBeenCalledWith(
      candidato.id,
      "lead.asignado",
      expect.objectContaining({ leadId: leadDos.id }),
    );
  });

  it("cartera con varios leads se distribuye entre los candidatos por menor-carga-primero con UNA sola consulta de candidatos y de carga (no N+1)", async () => {
    await desactivarTodos("ASESOR");

    const victima = await crearUsuario("ASESOR");
    const candidatosCreados = await Promise.all([
      crearUsuario("ASESOR"),
      crearUsuario("ASESOR"),
      crearUsuario("ASESOR"),
    ]);
    const candidatoIds = candidatosCreados.map((c) => c.id).sort();

    const leads = await Promise.all(
      Array.from({ length: 6 }, () => crearLead({ asesorId: victima.id, etapa: "NUEVO" })),
    );

    const spyActivos = vi.spyOn(usuarioRepository, "findActivosPorRol");
    const spyCargas = vi.spyOn(leadRepository, "countCargaActivaPorResponsable");

    await deactivateUsuario(victima.id);

    expect(spyActivos).toHaveBeenCalledTimes(1);
    expect(spyCargas).toHaveBeenCalledTimes(1);
    spyActivos.mockRestore();
    spyCargas.mockRestore();

    const conteoPorCandidato = new Map<string, number>(candidatoIds.map((id) => [id, 0]));
    for (const lead of leads) {
      const leadActualizado = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(leadActualizado.asesorId).not.toBeNull();
      expect(candidatoIds).toContain(leadActualizado.asesorId);
      conteoPorCandidato.set(
        leadActualizado.asesorId as string,
        (conteoPorCandidato.get(leadActualizado.asesorId as string) ?? 0) + 1,
      );
    }

    // Los 3 candidatos arrancan con carga activa 0 — 6 leads distribuidos
    // por menor-carga-primero deben repartirse 2/2/2, nunca apilarse en uno.
    for (const id of candidatoIds) {
      expect(conteoPorCandidato.get(id)).toBe(2);
    }
  });

  it("vendedor con cartera abierta (leads traspasados) y otro vendedor activo disponible: baja exitosa con evento TRASPASO", async () => {
    await desactivarTodos("VENDEDOR");

    const victima = await crearUsuario("VENDEDOR");
    const candidato = await crearUsuario("VENDEDOR");
    const asesor = await crearUsuario("ASESOR", false);
    const lead = await crearLead({ asesorId: asesor.id, vendedorId: victima.id, etapa: "CITA" });

    await deactivateUsuario(victima.id);

    const victimaTrasBaja = await prisma.usuario.findUniqueOrThrow({ where: { id: victima.id } });
    expect(victimaTrasBaja.activo).toBe(false);

    const leadActualizado = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadActualizado.vendedorId).toBe(candidato.id);

    const evento = await prisma.leadEvento.findFirst({
      where: { leadId: lead.id, tipo: "TRASPASO" },
    });
    expect(evento).not.toBeNull();
    expect(evento?.detalle).toMatchObject({
      motivo: "baja_usuario",
      responsableId: candidato.id,
      responsableAnteriorId: victima.id,
      ejecutadoPorId: null,
    });
  });

  it("asesor último activo de su rol con cartera abierta: baja RECHAZADA (409) y nada se persiste", async () => {
    await desactivarTodos("ASESOR");

    const victima = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: victima.id, etapa: "NUEVO" });

    await expect(deactivateUsuario(victima.id)).rejects.toMatchObject({
      code: "baja_sin_candidato_reasignacion",
      statusHttp: 409,
    });

    const victimaTrasIntento = await prisma.usuario.findUniqueOrThrow({ where: { id: victima.id } });
    expect(victimaTrasIntento.activo).toBe(true);

    const leadTrasIntento = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadTrasIntento.asesorId).toBe(victima.id);

    const eventosTrasIntento = await prisma.leadEvento.count({ where: { leadId: lead.id } });
    expect(eventosTrasIntento).toBe(0);
  });

  it("asesor sin cartera abierta (todos los leads en etapa terminal): baja exitosa sin ningún candidato disponible", async () => {
    await desactivarTodos("ASESOR");

    const victima = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: victima.id, etapa: "VENTA" });

    await expect(deactivateUsuario(victima.id)).resolves.toBeUndefined();

    const victimaTrasBaja = await prisma.usuario.findUniqueOrThrow({ where: { id: victima.id } });
    expect(victimaTrasBaja.activo).toBe(false);

    const leadTrasBaja = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadTrasBaja.asesorId).toBe(victima.id);

    const eventos = await prisma.leadEvento.count({ where: { leadId: lead.id } });
    expect(eventos).toBe(0);
  });

  it("leads con vendedorId ya asignado (traspasados) NO se incluyen en la cartera de reasignación del asesor original", async () => {
    await desactivarTodos("ASESOR");

    const victima = await crearUsuario("ASESOR");
    const vendedor = await crearUsuario("VENDEDOR", false);
    const lead = await crearLead({ asesorId: victima.id, vendedorId: vendedor.id, etapa: "CITA" });

    // Sin otro asesor activo — si el lead traspasado contara como cartera del
    // asesor, la baja se rechazaría por falta de candidato.
    await expect(deactivateUsuario(victima.id)).resolves.toBeUndefined();

    const victimaTrasBaja = await prisma.usuario.findUniqueOrThrow({ where: { id: victima.id } });
    expect(victimaTrasBaja.activo).toBe(false);

    const leadTrasBaja = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadTrasBaja.asesorId).toBe(victima.id);

    const eventos = await prisma.leadEvento.count({ where: { leadId: lead.id } });
    expect(eventos).toBe(0);
  });

  it("administrador dado de baja: sin cambios de comportamiento — nunca corre ningún paso de reasignación", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");

    await expect(deactivateUsuario(admin.id)).resolves.toBeUndefined();

    const adminTrasBaja = await prisma.usuario.findUniqueOrThrow({ where: { id: admin.id } });
    expect(adminTrasBaja.activo).toBe(false);
  });

  it("supervisor dado de baja: sin cambios de comportamiento — nunca corre ningún paso de reasignación", async () => {
    const supervisor = await crearUsuario("SUPERVISOR");

    await expect(deactivateUsuario(supervisor.id)).resolves.toBeUndefined();

    const supervisorTrasBaja = await prisma.usuario.findUniqueOrThrow({ where: { id: supervisor.id } });
    expect(supervisorTrasBaja.activo).toBe(false);
  });

  it("404 con un id que no existe", async () => {
    await expect(
      deactivateUsuario("00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({ code: "usuario_no_encontrado", statusHttp: 404 });
  });
});
