import { afterAll, describe, expect, it } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import * as leadRecibidoRepository from "../src/repositories/lead-recibido.repository.js";
import type { LeadEntrante } from "../src/types/lead-entrante.js";

let contador = 0;

/** Bridge de prueba con clave de API unica — evita colision del UNIQUE. */
async function crearBridge(): Promise<{ id: string }> {
  contador += 1;
  const bridge = await prisma.bridge.create({
    data: {
      redSocial: "GOOGLE_FORMS",
      nombre: `Bridge de prueba ingesta ${contador}`,
      claveApiHash: hashClaveBridge(`clave-ingesta-${contador}`),
      estado: "ACTIVO",
    },
  });
  return { id: bridge.id };
}

function entradaBase(bridgeId: string, overrides: Partial<LeadEntrante> = {}): LeadEntrante {
  contador += 1;
  const idExternoLead = `externo-ingesta-${contador}`;
  return {
    redSocial: "GOOGLE_FORMS",
    bridgeId,
    nombre: "Cliente de prueba",
    // Prefijo "097" (distinto del "099" de `deduplicacion.service.test.ts`
    // y del "098" de `prisma.runInTransaction.test.ts`) para que ningún
    // teléfono normalizado colisione entre archivos de prueba cuando la
    // suite completa corre sin truncar entre ellos (D-H).
    telefono: `097${String(contador).padStart(7, "0")}`,
    correo: null,
    idExternoLead,
    idExternoCampania: null,
    nombreCampania: null,
    idExternoCuenta: null,
    camposDinamicos: {},
    ingresadoEn: new Date(),
    payloadOriginal: { idExternoLead },
    ...overrides,
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("buzón durable de ingesta", () => {
  async function cerrarRecepcionesElegibles(): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE leads_recibidos SET estado = 'PROCESADO', lease_owner = NULL, lease_hasta = NULL WHERE estado <> 'PROCESADO'`,
    );
  }

  it("entrega un único lease bajo reclamos concurrentes y excluye el lease vigente", async () => {
    await cerrarRecepcionesElegibles();
    const { id: bridgeId } = await crearBridge();
    const entrada = entradaBase(bridgeId);
    const ahora = new Date("2026-08-18T00:00:00.000Z");
    await leadRecibidoRepository.aceptarLeadRecibido(entrada, ahora);

    const [primero, segundo] = await Promise.all([
      leadRecibidoRepository.claimNext(ahora, "worker-a"),
      leadRecibidoRepository.claimNext(ahora, "worker-b"),
    ]);
    const claims = [primero, segundo].filter((claim) => claim !== null);

    expect(claims).toHaveLength(1);
    expect(claims[0]).toEqual(
      expect.objectContaining({ intento: 1, leaseOwner: expect.stringMatching(/^worker-[ab]$/) }),
    );
    expect(await leadRecibidoRepository.claimNext(ahora, "worker-c")).toBeNull();
  });

  it("recupera un lease vencido y rechaza al propietario anterior", async () => {
    await cerrarRecepcionesElegibles();
    const { id: bridgeId } = await crearBridge();
    const entrada = entradaBase(bridgeId);
    const inicio = new Date("2026-08-18T01:00:00.000Z");
    const recepcion = await leadRecibidoRepository.aceptarLeadRecibido(entrada, inicio);
    await leadRecibidoRepository.claimNext(inicio, "worker-vencido");

    const recuperado = await leadRecibidoRepository.claimNext(
      new Date(inicio.getTime() + 61_000),
      "worker-recuperacion",
    );
    const propietarioAnteriorAceptado = await leadRecibidoRepository.marcarFallo(
      recepcion.recepcionId,
      "worker-vencido",
      "error tardío",
      new Date(inicio.getTime() + 62_000),
    );

    expect(recuperado).toEqual(
      expect.objectContaining({
        recepcionId: recepcion.recepcionId,
        leaseOwner: "worker-recuperacion",
        intento: 2,
      }),
    );
    expect(propietarioAnteriorAceptado).toBe(false);
  });
});
