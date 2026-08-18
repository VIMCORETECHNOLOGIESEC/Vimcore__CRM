import { afterAll, describe, expect, it, vi } from "vitest";
import { SLA_HORAS } from "../src/config/negocio.js";
import { startSlaAtrasadoJob } from "../src/jobs/sla-atrasado.job.js";
import { prisma } from "../src/lib/prisma.js";
import { detectLeadsAtrasados, type ResultadoDeteccion } from "../src/services/sla-atrasado.service.js";

const PLAZO_MS = SLA_HORAS * 60 * 60 * 1000;

let contador = 0;

async function crearCliente(): Promise<{ id: string }> {
  contador += 1;
  return prisma.cliente.create({
    data: { nombre: `Cliente sla-atrasado ${contador}`, telefonoValido: false },
  });
}

async function crearAsesorActivo(): Promise<{ id: string }> {
  contador += 1;
  return prisma.usuario.create({
    data: {
      nombre: `Asesor sla-atrasado ${contador}`,
      correo: `asesor-sla-atrasado-${contador}@integracion.test`,
      passwordHash: "hash-no-usado",
      rol: "ASESOR",
      activo: true,
    },
  });
}

async function crearLeadAtrasado(slaInicioEn: Date, asesorId: string): Promise<{ id: string }> {
  const cliente = await crearCliente();
  return prisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: "CONTACTADO",
      ingresadoEn: new Date(slaInicioEn.getTime() - 60_000),
      slaInicioEn,
      asesorId,
    },
  });
}

function fronteraAtrasadaHace(msExtra: number): Date {
  return new Date(Date.now() - PLAZO_MS - msExtra);
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("sla-atrasado.job — detectLeadsAtrasados (M6, D2/D4)", () => {
  it("prueba obligatoria 8a: dos corridas seguidas producen una sola fila SLA_INCUMPLIDO", async () => {
    const asesor = await crearAsesorActivo();
    const lead = await crearLeadAtrasado(fronteraAtrasadaHace(60_000), asesor.id);

    const primeraCorrida = await detectLeadsAtrasados(new Date());
    expect(primeraCorrida.eventosCreados).toBeGreaterThanOrEqual(1);

    const segundaCorrida = await detectLeadsAtrasados(new Date());
    expect(segundaCorrida.eventosCreados).toBe(0);

    const eventos = await prisma.leadEvento.findMany({
      where: { leadId: lead.id, tipo: "SLA_INCUMPLIDO" },
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.detalle).toMatchObject({
      requiereNotificacion: true,
      motivo: "sla_vencido",
      responsableId: asesor.id,
    });
  });

  it("prueba obligatoria 8b: reasignar y volver a vencer produce una segunda fila distinta", async () => {
    const asesor = await crearAsesorActivo();
    const lead = await crearLeadAtrasado(fronteraAtrasadaHace(60_000), asesor.id);

    await detectLeadsAtrasados(new Date());

    // D3/D4: reasignar reinicia slaInicioEn a "ahora" — posterior al
    // `ocurridoEn` real (default `now()` en BD) del evento ya escrito. Para
    // que vuelva a vencer sin esperar 24h reales, el segundo `ahora`
    // inyectado simula el paso del tiempo hacia adelante: el filtro de
    // idempotencia queda fuera de ventana (`ocurridoEn < slaInicioEn`
    // vigente) y el candidato vuelve a cruzar `fronteraAtrasado`.
    const slaInicioEnNuevo = new Date();
    await prisma.lead.update({
      where: { id: lead.id },
      data: { slaInicioEn: slaInicioEnNuevo },
    });

    const ahoraSimulado = new Date(slaInicioEnNuevo.getTime() + PLAZO_MS + 60_000);
    await detectLeadsAtrasados(ahoraSimulado);

    const eventos = await prisma.leadEvento.findMany({
      where: { leadId: lead.id, tipo: "SLA_INCUMPLIDO" },
      orderBy: { ocurridoEn: "asc" },
    });
    expect(eventos).toHaveLength(2);
    expect(eventos[1]!.id).not.toBe(eventos[0]!.id);
  });

  it("prueba obligatoria 4 (reafirmada, D3): lead sin asignar (slaInicioEn=null) nunca se marca atrasado", async () => {
    const cliente = await crearCliente();
    const lead = await prisma.lead.create({
      data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date() },
    });

    await detectLeadsAtrasados(new Date());

    const evento = await prisma.leadEvento.findFirst({
      where: { leadId: lead.id, tipo: "SLA_INCUMPLIDO" },
    });
    expect(evento).toBeNull();
  });

  it("un lead cerrado con slaInicioEn vencido no se detecta atrasado (forma del índice idx_leads_sla, DD1)", async () => {
    const asesor = await crearAsesorActivo();
    const cliente = await crearCliente();
    const slaInicioEn = fronteraAtrasadaHace(60_000);
    const lead = await prisma.lead.create({
      data: {
        clienteId: cliente.id,
        origen: "NUEVO",
        etapa: "VENTA",
        ingresadoEn: new Date(slaInicioEn.getTime() - 60_000),
        slaInicioEn,
        cerradoEn: new Date(),
        asesorId: asesor.id,
      },
    });

    await detectLeadsAtrasados(new Date());

    const evento = await prisma.leadEvento.findFirst({
      where: { leadId: lead.id, tipo: "SLA_INCUMPLIDO" },
    });
    expect(evento).toBeNull();
  });
});

describe("sla-atrasado.job — startSlaAtrasadoJob, guarda de re-entrada (D2)", () => {
  it("descarta un tick mientras el anterior sigue en curso, y retoma en el siguiente disparo", async () => {
    vi.useFakeTimers();
    try {
      let resolverPrimeraCorrida: (() => void) | undefined;
      const detectarMock = vi.fn(
        () =>
          new Promise<ResultadoDeteccion>((resolve) => {
            resolverPrimeraCorrida = () => resolve({ candidatos: 0, eventosCreados: 0 });
          }),
      );

      startSlaAtrasadoJob(1000, detectarMock);

      await vi.advanceTimersByTimeAsync(1000); // dispara el primer tick, queda pendiente
      await vi.advanceTimersByTimeAsync(1000); // segundo disparo mientras el primero sigue en curso
      expect(detectarMock).toHaveBeenCalledTimes(1); // el segundo se descartó por la guarda

      resolverPrimeraCorrida?.();
      await vi.advanceTimersByTimeAsync(0); // deja que la promesa resuelva y limpie `enCurso`

      await vi.advanceTimersByTimeAsync(1000); // ya no hay tick en curso: el tercero sí corre
      expect(detectarMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
