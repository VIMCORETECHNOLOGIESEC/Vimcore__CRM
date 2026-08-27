import { afterAll, describe, expect, it, vi } from "vitest";
import { startCitasRecordatorioJob } from "../src/jobs/citas-recordatorio.job.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import {
  enviarRecordatoriosCita,
  type ResultadoRecordatorioCitas,
} from "../src/services/citas-recordatorio.service.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

let contador = 0;

async function crearUsuario(): Promise<{ id: string }> {
  contador += 1;
  return prisma.usuario.create({
    data: {
      nombre: `Usuario recordatorio ${contador}`,
      correo: `usuario-recordatorio-${contador}@integracion.test`,
      passwordHash: "hash-no-usado",
      rol: "VENDEDOR",
      activo: true,
    },
  });
}

async function crearLead(): Promise<{ id: string }> {
  contador += 1;
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente recordatorio ${contador}`, telefonoValido: false },
  });
  return testAdminPrisma.lead.create({
    data: { clienteId: cliente.id, origen: "NUEVO", etapa: "CITA", ingresadoEn: new Date(), empresaId: EMPRESA_BOOTSTRAP_ID },
  });
}

async function crearCita(overrides: {
  programadaPara: Date;
  estado?: "AGENDADA" | "CUMPLIDA" | "NO_ASISTIO" | "REPROGRAMADA" | "CANCELADA";
  recordatorioEnviado?: boolean;
}): Promise<{ id: string }> {
  const usuario = await crearUsuario();
  const lead = await crearLead();
  return testAdminPrisma.cita.create({
    data: {
      leadId: lead.id,
      empresaId: EMPRESA_BOOTSTRAP_ID,
      usuarioId: usuario.id,
      programadaPara: overrides.programadaPara,
      modalidad: "VIRTUAL",
      estado: overrides.estado ?? "AGENDADA",
      recordatorioEnviado: overrides.recordatorioEnviado ?? false,
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("citas-recordatorio.service — enviarRecordatoriosCita (M7, checklist: recordatorio 1 hora antes)", () => {
  it("marca recordatorioEnviado=true en una cita AGENDADA que entra en la ventana de 1h", async () => {
    const ahora = new Date();
    const cita = await crearCita({ programadaPara: new Date(ahora.getTime() + 30 * 60 * 1000) });

    const resultado = await enviarRecordatoriosCita(ahora);

    expect(resultado.candidatos).toBeGreaterThanOrEqual(1);
    expect(resultado.recordatoriosMarcados).toBeGreaterThanOrEqual(1);

    const citaActualizada = await testAdminPrisma.cita.findUniqueOrThrow({ where: { id: cita.id } });
    expect(citaActualizada.recordatorioEnviado).toBe(true);
  });

  it("una segunda corrida inmediata no vuelve a contar la misma cita (idempotencia)", async () => {
    const ahora = new Date();
    await crearCita({ programadaPara: new Date(ahora.getTime() + 30 * 60 * 1000) });

    const primeraCorrida = await enviarRecordatoriosCita(ahora);
    expect(primeraCorrida.recordatoriosMarcados).toBeGreaterThanOrEqual(1);

    const segundaCorrida = await enviarRecordatoriosCita(ahora);
    expect(segundaCorrida.candidatos).toBe(0);
    expect(segundaCorrida.recordatoriosMarcados).toBe(0);
  });

  it("ignora una cita fuera de la ventana de 1h (programada en 2h)", async () => {
    const ahora = new Date();
    const cita = await crearCita({ programadaPara: new Date(ahora.getTime() + 2 * 60 * 60 * 1000) });

    await enviarRecordatoriosCita(ahora);

    const citaSinCambios = await testAdminPrisma.cita.findUniqueOrThrow({ where: { id: cita.id } });
    expect(citaSinCambios.recordatorioEnviado).toBe(false);
  });

  it("ignora una cita que ya pasó (fuera de la ventana [ahora, ahora+1h])", async () => {
    const ahora = new Date();
    const cita = await crearCita({ programadaPara: new Date(ahora.getTime() - 5 * 60 * 1000) });

    await enviarRecordatoriosCita(ahora);

    const citaSinCambios = await testAdminPrisma.cita.findUniqueOrThrow({ where: { id: cita.id } });
    expect(citaSinCambios.recordatorioEnviado).toBe(false);
  });

  it("ignora una cita CANCELADA aunque esté dentro de la ventana de 1h", async () => {
    const ahora = new Date();
    const cita = await crearCita({
      programadaPara: new Date(ahora.getTime() + 30 * 60 * 1000),
      estado: "CANCELADA",
    });

    await enviarRecordatoriosCita(ahora);

    const citaSinCambios = await testAdminPrisma.cita.findUniqueOrThrow({ where: { id: cita.id } });
    expect(citaSinCambios.recordatorioEnviado).toBe(false);
  });

  it("ignora una cita cuyo recordatorio ya se marcó antes", async () => {
    const ahora = new Date();
    const cita = await crearCita({
      programadaPara: new Date(ahora.getTime() + 30 * 60 * 1000),
      recordatorioEnviado: true,
    });

    const resultado = await enviarRecordatoriosCita(ahora);

    expect(resultado.candidatos).toBe(0);
    const citaSinCambios = await testAdminPrisma.cita.findUniqueOrThrow({ where: { id: cita.id } });
    expect(citaSinCambios.recordatorioEnviado).toBe(true);
  });
});

describe("citas-recordatorio.job — startCitasRecordatorioJob, guarda de re-entrada (mismo patrón D2 de M6)", () => {
  it("descarta un tick mientras el anterior sigue en curso, y retoma en el siguiente disparo", async () => {
    vi.useFakeTimers();
    try {
      let resolverPrimeraCorrida: (() => void) | undefined;
      const enviarMock = vi.fn(
        () =>
          new Promise<ResultadoRecordatorioCitas>((resolve) => {
            resolverPrimeraCorrida = () => resolve({ candidatos: 0, recordatoriosMarcados: 0 });
          }),
      );

      startCitasRecordatorioJob(1000, enviarMock);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);
      expect(enviarMock).toHaveBeenCalledTimes(1);

      resolverPrimeraCorrida?.();
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(1000);
      expect(enviarMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
