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

/**
 * Cambio de ventana (feature aditiva post-M7): "mañana" es SIEMPRE el mismo
 * día calendario, en cualquier huso de offset fijo (Ecuador incluido), que
 * `referencia + 24h` — sumar 24h preserva la misma hora de reloj de pared un
 * día calendario después, sin importar en qué punto del día está
 * `referencia`. Evita reimplementar acá la lógica de `rangoManianaEcuador`
 * que ya se prueba aparte (`tests/rango-fechas.test.ts`) — este archivo solo
 * necesita UN instante garantizado dentro de la ventana, no reconstruir el
 * cálculo.
 */
function unDiaDespues(referencia: Date): Date {
  return new Date(referencia.getTime() + 24 * 60 * 60 * 1000);
}

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
      finalizaEn: new Date(overrides.programadaPara.getTime() + 60 * 60 * 1000),
      modalidad: "VIRTUAL",
      estado: overrides.estado ?? "AGENDADA",
      recordatorioEnviado: overrides.recordatorioEnviado ?? false,
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

// Referencia FIJA (no `new Date()`): 2026-08-18T15:30:00.000Z = 10:30 Ecuador
// -- cómodamente a mitad del día, para que "más tarde hoy" (+2h) nunca
// arriesgue cruzar la medianoche Ecuador y colarse en la ventana de
// "mañana" por casualidad de la hora real de la corrida (misma referencia
// fija que ya usa `tests/rango-fechas.test.ts`).
const AHORA = new Date("2026-08-18T15:30:00.000Z");

describe("citas-recordatorio.service — enviarRecordatoriosCita (feature aditiva post-M7: ventana = día calendario de MAÑANA en hora Ecuador)", () => {
  it("marca recordatorioEnviado=true en una cita AGENDADA programada para mañana (Ecuador)", async () => {
    const cita = await crearCita({ programadaPara: unDiaDespues(AHORA) });

    const resultado = await enviarRecordatoriosCita(AHORA);

    expect(resultado.candidatos).toBeGreaterThanOrEqual(1);
    expect(resultado.recordatoriosMarcados).toBeGreaterThanOrEqual(1);

    const citaActualizada = await testAdminPrisma.cita.findUniqueOrThrow({ where: { id: cita.id } });
    expect(citaActualizada.recordatorioEnviado).toBe(true);
  });

  it("una segunda corrida inmediata no vuelve a contar la misma cita (idempotencia)", async () => {
    await crearCita({ programadaPara: unDiaDespues(AHORA) });

    const primeraCorrida = await enviarRecordatoriosCita(AHORA);
    expect(primeraCorrida.recordatoriosMarcados).toBeGreaterThanOrEqual(1);

    const segundaCorrida = await enviarRecordatoriosCita(AHORA);
    expect(segundaCorrida.candidatos).toBe(0);
    expect(segundaCorrida.recordatoriosMarcados).toBe(0);
  });

  it("ignora una cita programada para HOY (fuera de la ventana de mañana)", async () => {
    // Un par de horas hacia adelante, pero dentro del mismo día calendario
    // Ecuador que `AHORA` -- nunca cruza a "mañana".
    const masTardeHoy = new Date(AHORA.getTime() + 2 * 60 * 60 * 1000);
    const cita = await crearCita({ programadaPara: masTardeHoy });

    await enviarRecordatoriosCita(AHORA);

    const citaSinCambios = await testAdminPrisma.cita.findUniqueOrThrow({ where: { id: cita.id } });
    expect(citaSinCambios.recordatorioEnviado).toBe(false);
  });

  it("ignora una cita programada para PASADO MAÑANA (fuera de la ventana de mañana)", async () => {
    const pasadoManiana = unDiaDespues(unDiaDespues(AHORA));
    const cita = await crearCita({ programadaPara: pasadoManiana });

    await enviarRecordatoriosCita(AHORA);

    const citaSinCambios = await testAdminPrisma.cita.findUniqueOrThrow({ where: { id: cita.id } });
    expect(citaSinCambios.recordatorioEnviado).toBe(false);
  });

  it("ignora una cita CANCELADA aunque caiga mañana", async () => {
    const cita = await crearCita({
      programadaPara: unDiaDespues(AHORA),
      estado: "CANCELADA",
    });

    await enviarRecordatoriosCita(AHORA);

    const citaSinCambios = await testAdminPrisma.cita.findUniqueOrThrow({ where: { id: cita.id } });
    expect(citaSinCambios.recordatorioEnviado).toBe(false);
  });

  it("ignora una cita cuyo recordatorio ya se marcó antes", async () => {
    const cita = await crearCita({
      programadaPara: unDiaDespues(AHORA),
      recordatorioEnviado: true,
    });

    const resultado = await enviarRecordatoriosCita(AHORA);

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
