import { describe, expect, it } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import * as leadRecibidoRepository from "../src/repositories/lead-recibido.repository.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

let contador = 0;

/** Bridge de prueba con clave de API unica — evita colision del UNIQUE. */
async function crearBridge(): Promise<{ id: string }> {
  contador += 1;
  const bridge = await prisma.bridge.create({
    data: {
      redSocial: "GOOGLE_FORMS",
      nombre: `Bridge de prueba ${contador}`,
      claveApiHash: hashClaveBridge(`clave-lead-recibido-${contador}`),
      estado: "ACTIVO",
      empresaId: EMPRESA_BOOTSTRAP_ID,
    },
  });
  return { id: bridge.id };
}

/** Cliente + lead minimos para satisfacer la FK de `marcarProcesado`. */
async function crearLead(): Promise<{ id: string }> {
  contador += 1;
  const cliente = await prisma.cliente.create({
    data: {
      nombre: `Cliente de prueba ${contador}`,
      telefonoNormalizado: `+549110000${contador}`,
      telefonoValido: true,
    },
  });
  const lead = await prisma.lead.create({
    data: { clienteId: cliente.id, origen: "NUEVO", ingresadoEn: new Date(), empresaId: EMPRESA_BOOTSTRAP_ID },
  });
  return { id: lead.id };
}

describe("repositories/lead-recibido — upsertLeadRecibido (M4, PR2)", () => {
  it("reporta xmax = 0 en la primera insercion y xmax != 0 en un reintento en conflicto (Requirement: Idempotent reception)", async () => {
    const { id: bridgeId } = await crearBridge();
    const idExternoLead = `externo-${++contador}`;

    const primera = await leadRecibidoRepository.upsertLeadRecibido({
      bridgeId,
      idExternoLead,
      payload: { idExternoCampania: "camp-1" },
      datosIncompletos: false,
    });
    expect(primera.recepcionCreada).toBe(true);

    const reintento = await leadRecibidoRepository.upsertLeadRecibido({
      bridgeId,
      idExternoLead,
      payload: { idExternoCampania: "camp-1" },
      datosIncompletos: false,
    });
    expect(reintento.recepcionCreada).toBe(false);
    expect(reintento.id).toBe(primera.id); // DO UPDATE garantiza la misma fila
  });

  it("persiste el payload crudo con la atribucion de campana sin resolver (Requirement: Raw campaign attribution storage)", async () => {
    const { id: bridgeId } = await crearBridge();
    const idExternoLead = `externo-${++contador}`;

    const fila = await leadRecibidoRepository.upsertLeadRecibido({
      bridgeId,
      idExternoLead,
      payload: { idExternoCampania: "camp-9", nombreCampania: "Invierno", idExternoCuenta: "cta-3" },
      datosIncompletos: true,
    });

    expect(fila.payload).toMatchObject({
      idExternoCampania: "camp-9",
      nombreCampania: "Invierno",
      idExternoCuenta: "cta-3",
    });
    expect(fila.datosIncompletos).toBe(true);
    expect(fila.leadId).toBeNull();
  });
});

describe("repositories/lead-recibido — marcarProcesado (M4, PR2)", () => {
  it("ancla la recepcion al lead resultante de la deduplicacion", async () => {
    const { id: bridgeId } = await crearBridge();
    const { id: leadId } = await crearLead();
    const recepcion = await leadRecibidoRepository.upsertLeadRecibido({
      bridgeId,
      idExternoLead: `externo-${++contador}`,
      payload: {},
      datosIncompletos: false,
    });
    expect(recepcion.leadId).toBeNull();

    await leadRecibidoRepository.marcarProcesado(recepcion.id, leadId);

    const actualizada = await prisma.leadRecibido.findUniqueOrThrow({ where: { id: recepcion.id } });
    expect(actualizada.leadId).toBe(leadId);
  });
});
