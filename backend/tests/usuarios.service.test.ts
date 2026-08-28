import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eventBroker } from "../src/lib/event-broker.js";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import * as leadEventoRepository from "../src/repositories/lead-evento.repository.js";
import * as leadRepository from "../src/repositories/lead.repository.js";
import * as notificacionRepository from "../src/repositories/notificacion.repository.js";
import * as usuarioRepository from "../src/repositories/usuario.repository.js";
import { createUsuario, deactivateUsuario } from "../src/services/usuarios.service.js";
import type { EtapaLead, RolUsuario } from "@prisma/client";

const BOOTSTRAP_EMPRESA_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Bloque C (Etapa 3, batch 3 discovery, D2 gap closure): `createUsuario`/
 * `deactivateUsuario` se llaman DIRECTO (sin HTTP) en todo este archivo —
 * ambas tocan `membresias`/`leads`/`lead_eventos` (RLS) sin `TenantContext`
 * si no se envuelven. Todos los fixtures de este archivo viven en la
 * empresa bootstrap, así que un contexto fijo a esa empresa es correcto acá
 * (a diferencia de `deduplicacion.service.test.ts`, que necesita
 * unrestricted por cruzar dos empresas en una misma prueba).
 */
function conContexto<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ empresaId: BOOTSTRAP_EMPRESA_ID }, fn);
}

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
  return testAdminPrisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: data.etapa ?? "NUEVO",
      ingresadoEn: new Date(),
      asesorId: data.asesorId,
      vendedorId: data.vendedorId,
      empresaId: BOOTSTRAP_EMPRESA_ID,
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

describe("usuarios.service — createUsuario (Bloque C follow-up, D2 gap closure: Membresia bootstrap at user creation)", () => {
  it("ASESOR: crea el Usuario y una Membresia activa (rol=ASESOR, habilitadoParaVenta=false) en la misma transacción", () =>
    conContexto(async () => {
      const creado = await createUsuario({
        nombre: "Asesor Nuevo",
        correo: `asesor-nuevo-${randomUUID()}@integracion.test`,
        password: "clave-asesor-123456",
        rol: "ASESOR",
        empresaId: BOOTSTRAP_EMPRESA_ID,
      });

      const membresia = await testAdminPrisma.membresia.findFirst({ where: { usuarioId: creado.id } });
      expect(membresia).toMatchObject({
        empresaId: BOOTSTRAP_EMPRESA_ID,
        rol: "ASESOR",
        habilitadoParaVenta: false,
        activa: true,
      });
    }));

  it("VENDEDOR legado: crea el Usuario y una Membresia(rol=ASESOR, habilitadoParaVenta=true)", () =>
    conContexto(async () => {
      const creado = await createUsuario({
        nombre: "Vendedor Nuevo",
        correo: `vendedor-nuevo-${randomUUID()}@integracion.test`,
        password: "clave-vendedor-123456",
        rol: "VENDEDOR",
        empresaId: BOOTSTRAP_EMPRESA_ID,
      });

      const membresia = await testAdminPrisma.membresia.findFirst({ where: { usuarioId: creado.id } });
      expect(membresia).toMatchObject({
        empresaId: BOOTSTRAP_EMPRESA_ID,
        rol: "ASESOR",
        habilitadoParaVenta: true,
        activa: true,
      });
    }));

  it("ADMINISTRADOR: crea el Usuario SIN ninguna Membresia (holding-wide incondicional, D2)", () =>
    conContexto(async () => {
      const creado = await createUsuario({
        nombre: "Admin Nuevo",
        correo: `admin-nuevo-${randomUUID()}@integracion.test`,
        password: "clave-admin-123456",
        rol: "ADMINISTRADOR",
      });

      const membresias = await testAdminPrisma.membresia.findMany({ where: { usuarioId: creado.id } });
      expect(membresias).toEqual([]);
    }));

  it("SUPERVISOR: crea el Usuario SIN ninguna Membresia (holding-wide incondicional, D2)", () =>
    conContexto(async () => {
      const creado = await createUsuario({
        nombre: "Supervisor Nuevo",
        correo: `supervisor-nuevo-${randomUUID()}@integracion.test`,
        password: "clave-supervisor-123456",
        rol: "SUPERVISOR",
      });

      const membresias = await testAdminPrisma.membresia.findMany({ where: { usuarioId: creado.id } });
      expect(membresias).toEqual([]);
    }));

  it("ASESOR sin empresaId: rechaza con 400 y NO persiste el Usuario (atomicidad)", () =>
    conContexto(async () => {
      const correo = `asesor-sin-empresa-${randomUUID()}@integracion.test`;

      await expect(
        createUsuario({
          nombre: "Asesor Sin Empresa",
          correo,
          password: "clave-asesor-123456",
          rol: "ASESOR",
        }),
      ).rejects.toMatchObject({ statusHttp: 400 });

      const usuarioPersistido = await prisma.usuario.findUnique({ where: { correo } });
      expect(usuarioPersistido).toBeNull();
    }));
});

describe("usuarios.service — deactivateUsuario (M2: baja lógica con reasignación obligatoria de cartera activa)", () => {
  it("asesor con cartera abierta y otro asesor activo disponible: baja exitosa, cada lead reasignado con evento REASIGNACION y SSE emitido", () =>
    conContexto(async () => {
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
        BOOTSTRAP_EMPRESA_ID,
      );
      expect(publish).toHaveBeenCalledWith(
        candidato.id,
        "lead.asignado",
        expect.objectContaining({ leadId: leadDos.id }),
        BOOTSTRAP_EMPRESA_ID,
      );
    }));

  it("cartera con varios leads se distribuye entre los candidatos por menor-carga-primero con UNA sola consulta de candidatos y de carga (no N+1)", () =>
    conContexto(async () => {
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
    }));

  it("fix bulk writes: cartera grande (99 leads, 3 candidatos) se reparte ~33/33/33 con escrituras agrupadas por receptor, no N+1", () =>
    conContexto(async () => {
      await desactivarTodos("ASESOR");

      const victima = await crearUsuario("ASESOR");
      const candidatosCreados = await Promise.all([
        crearUsuario("ASESOR"),
        crearUsuario("ASESOR"),
        crearUsuario("ASESOR"),
      ]);
      const candidatoIds = candidatosCreados.map((c) => c.id).sort();

      const TOTAL_LEADS = 99;
      const leads = await Promise.all(
        Array.from({ length: TOTAL_LEADS }, () => crearLead({ asesorId: victima.id, etapa: "NUEVO" })),
      );

      const spyBulkAssign = vi.spyOn(leadRepository, "assignResponsableBulk");
      const spyBulkUltimaAsignacion = vi.spyOn(usuarioRepository, "updateUltimaAsignacionBulk");
      const spyBulkEventos = vi.spyOn(leadEventoRepository, "createEventos");
      const spyBulkNotificaciones = vi.spyOn(notificacionRepository, "createNotificaciones");

      // Guardrail: el camino N+1 (una escritura singular por lead) debe haber
      // desaparecido por completo de `deactivateUsuario`.
      const spySingularAssign = vi.spyOn(leadRepository, "assignResponsable");
      const spySingularUltimaAsignacion = vi.spyOn(usuarioRepository, "updateUltimaAsignacion");
      const spySingularEvento = vi.spyOn(leadEventoRepository, "createEvento");
      const spySingularNotificacion = vi.spyOn(notificacionRepository, "createNotificacion");

      await deactivateUsuario(victima.id);

      // Con 3 candidatos que arrancan en carga 0 y reparto por menor-carga-
      // primero, los 3 reciben carga en algún momento del reparto — la función
      // bulk de leads se llama una vez POR RECEPTOR CON CARGA, nunca una vez
      // por lead.
      expect(spyBulkAssign).toHaveBeenCalledTimes(3);
      expect(spyBulkUltimaAsignacion).toHaveBeenCalledTimes(1);
      expect(spyBulkEventos).toHaveBeenCalledTimes(1);
      expect(spyBulkNotificaciones).toHaveBeenCalledTimes(1);

      expect(spySingularAssign).toHaveBeenCalledTimes(0);
      expect(spySingularUltimaAsignacion).toHaveBeenCalledTimes(0);
      expect(spySingularEvento).toHaveBeenCalledTimes(0);
      expect(spySingularNotificacion).toHaveBeenCalledTimes(0);

      spyBulkAssign.mockRestore();
      spyBulkUltimaAsignacion.mockRestore();
      spyBulkEventos.mockRestore();
      spyBulkNotificaciones.mockRestore();
      spySingularAssign.mockRestore();
      spySingularUltimaAsignacion.mockRestore();
      spySingularEvento.mockRestore();
      spySingularNotificacion.mockRestore();

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

      for (const id of candidatoIds) {
        expect(conteoPorCandidato.get(id)).toBe(TOTAL_LEADS / 3);
      }

      // Cada lead tiene su propio evento REASIGNACION, aun escrito en lote.
      const totalEventos = await prisma.leadEvento.count({
        where: { leadId: { in: leads.map((l) => l.id) }, tipo: "REASIGNACION" },
      });
      expect(totalEventos).toBe(TOTAL_LEADS);
    }));

  it("vendedor con cartera abierta (leads traspasados) y otro vendedor activo disponible: baja exitosa con evento TRASPASO", () =>
    conContexto(async () => {
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
    }));

  it("asesor último activo de su rol con cartera abierta: baja RECHAZADA (409) y nada se persiste", () =>
    conContexto(async () => {
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
    }));

  it("asesor sin cartera abierta (todos los leads en etapa terminal): baja exitosa sin ningún candidato disponible", () =>
    conContexto(async () => {
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
    }));

  it("leads con vendedorId ya asignado (traspasados) NO se incluyen en la cartera de reasignación del asesor original", () =>
    conContexto(async () => {
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
    }));

  it("administrador dado de baja: sin cambios de comportamiento — nunca corre ningún paso de reasignación", () =>
    conContexto(async () => {
      const admin = await crearUsuario("ADMINISTRADOR");

      await expect(deactivateUsuario(admin.id)).resolves.toBeUndefined();

      const adminTrasBaja = await prisma.usuario.findUniqueOrThrow({ where: { id: admin.id } });
      expect(adminTrasBaja.activo).toBe(false);
    }));

  it("supervisor dado de baja: sin cambios de comportamiento — nunca corre ningún paso de reasignación", () =>
    conContexto(async () => {
      const supervisor = await crearUsuario("SUPERVISOR");

      await expect(deactivateUsuario(supervisor.id)).resolves.toBeUndefined();

      const supervisorTrasBaja = await prisma.usuario.findUniqueOrThrow({ where: { id: supervisor.id } });
      expect(supervisorTrasBaja.activo).toBe(false);
    }));

  it("404 con un id que no existe", () =>
    conContexto(async () => {
      await expect(
        deactivateUsuario("00000000-0000-0000-0000-000000000000"),
      ).rejects.toMatchObject({ code: "usuario_no_encontrado", statusHttp: 404 });
    }));
});
