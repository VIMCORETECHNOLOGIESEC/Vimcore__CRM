import { afterAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/lib/password.js";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { applyFormulario, type ApplyFormularioLead } from "../src/services/formularios.service.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

/**
 * Bloque C (Etapa 3, batch 3 discovery, D2 gap closure): `applyFormulario`
 * se llama DIRECTO (sin HTTP) — escribe `leads`/`lead_eventos` (RLS) sin
 * `TenantContext` si no se envuelve. Todos los fixtures de este archivo
 * viven en la empresa bootstrap.
 */
function conContexto<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ empresaId: EMPRESA_BOOTSTRAP_ID }, fn);
}

let contador = 0;

async function crearUsuario(): Promise<{ id: string }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Asesor FS ${contador}`,
      correo: `asesor-fs-${contador}@integracion.test`,
      passwordHash: await hashPassword("clave-de-prueba-123456"),
      rol: "ASESOR",
      activo: true,
    },
  });
  return { id: usuario.id };
}

async function crearLead(overrides: Partial<{ etapa: "NUEVO" | "CONTACTADO" | "CITA" | "VENTA" | "NO_VENTA"; semaforo: "ROJO" | "AMARILLO" | "VERDE" | null }> = {}): Promise<ApplyFormularioLead> {
  contador += 1;
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente FS ${contador}`, telefonoValido: false },
  });
  const lead = await testAdminPrisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: overrides.etapa ?? "NUEVO",
      semaforo: overrides.semaforo ?? null,
      ingresadoEn: new Date(),
      empresaId: EMPRESA_BOOTSTRAP_ID,
    },
  });
  return { id: lead.id, etapa: lead.etapa, semaforo: lead.semaforo, empresaId: lead.empresaId };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("services/formularios.service — applyFormulario (M5, DD4, seam de escritura compuesta)", () => {
  it("respuestas altas en NUEVO: inserta respuestas_formulario, actualiza lead.semaforo/puntuacion y emite CAMBIO_SEMAFORO (null -> VERDE)", () =>
    conContexto(async () => {
      const lead = await crearLead();
      const { id: usuarioId } = await crearUsuario();

      // NUEVO peso total 11 (docs/04 §3): usar la opción de mayor valor en cada pregunta produce 100.
      const respuestas = {
        contacto_logrado: "si_respondio",
        reconoce_formulario: "si_con_claridad",
        nivel_interes: "interes_alto_concreto",
        plazo_decision: "inmediato_menos_1_semana",
        toma_decision: "si",
      };

      const resultado = await applyFormulario(lead, respuestas, usuarioId);

      expect(resultado.puntuacion).toBe(100);
      expect(resultado.semaforo).toBe("VERDE");
      expect(resultado.eventoSemaforoId).not.toBeNull();

      const leadActualizado = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(leadActualizado.semaforo).toBe("VERDE");
      expect(leadActualizado.puntuacion).toBe(100);
      expect(leadActualizado.etapa).toBe("NUEVO"); // D16: no mueve etapa

      const respuestaPersistida = await prisma.respuestaFormulario.findUniqueOrThrow({
        where: { id: resultado.respuestaId },
      });
      expect(respuestaPersistida.leadId).toBe(lead.id);
      expect(respuestaPersistida.versionRubrica).toBe("v1");

      const evento = await prisma.leadEvento.findUniqueOrThrow({
        where: { id: resultado.eventoSemaforoId! },
      });
      expect(evento.tipo).toBe("CAMBIO_SEMAFORO");
      expect(evento.semaforoAnterior).toBeNull();
      expect(evento.semaforoNuevo).toBe("VERDE");
    }));

  it("D16: un segundo envío que produce el mismo color crea una fila nueva en respuestas_formulario pero NO un segundo CAMBIO_SEMAFORO", () =>
    conContexto(async () => {
      const lead = await crearLead({ semaforo: "VERDE" });
      const { id: usuarioId } = await crearUsuario();
      const respuestasAltas = {
        contacto_logrado: "si_respondio",
        reconoce_formulario: "si_con_claridad",
        nivel_interes: "interes_alto_concreto",
        plazo_decision: "inmediato_menos_1_semana",
        toma_decision: "si",
      };

      const resultado = await applyFormulario(lead, respuestasAltas, usuarioId);

      expect(resultado.semaforo).toBe("VERDE");
      expect(resultado.eventoSemaforoId).toBeNull();

      const totalRespuestas = await prisma.respuestaFormulario.count({ where: { leadId: lead.id } });
      expect(totalRespuestas).toBe(1);
      const totalEventosSemaforo = await prisma.leadEvento.count({
        where: { leadId: lead.id, tipo: "CAMBIO_SEMAFORO" },
      });
      expect(totalEventosSemaforo).toBe(0);
    }));

  it("rechaza aplicar el formulario sobre una etapa no calificable (VENTA/NO_VENTA, D6) sin escribir nada", () =>
    conContexto(async () => {
      const lead = await crearLead({ etapa: "VENTA" });
      const { id: usuarioId } = await crearUsuario();

      await expect(applyFormulario(lead, {}, usuarioId)).rejects.toThrow();

      const totalRespuestas = await prisma.respuestaFormulario.count({ where: { leadId: lead.id } });
      expect(totalRespuestas).toBe(0);
    }));

  it("txExterna suministrado: las escrituras viven dentro de esa transacción, no en una propia", () =>
    conContexto(async () => {
      const lead = await crearLead();
      const { id: usuarioId } = await crearUsuario();
      let respuestaId: string | undefined;

      await expect(
        prisma.$transaction(async (tx) => {
          const resultado = await applyFormulario(
            lead,
            { contacto_logrado: "si_respondio" },
            usuarioId,
            tx,
          );
          respuestaId = resultado.respuestaId;
          throw new Error("rollback forzado del llamador externo");
        }),
      ).rejects.toThrow("rollback forzado del llamador externo");

      const total = await prisma.respuestaFormulario.count({ where: { id: respuestaId } });
      expect(total).toBe(0);
      const leadSinCambios = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(leadSinCambios.semaforo).toBeNull();
    }));

  it("D8: cada envío crea su propia fila incluso si el color no cambia, respetando el historial completo", () =>
    conContexto(async () => {
      const lead = await crearLead();
      const { id: usuarioId } = await crearUsuario();

      await applyFormulario(lead, { contacto_logrado: "numero_invalido" }, usuarioId);
      const leadTrasBaja = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      await applyFormulario(
        { id: lead.id, etapa: lead.etapa, semaforo: leadTrasBaja.semaforo, empresaId: lead.empresaId },
        { contacto_logrado: "numero_invalido" },
        usuarioId,
      );

      const total = await prisma.respuestaFormulario.count({ where: { leadId: lead.id } });
      expect(total).toBe(2);
    }));
});
