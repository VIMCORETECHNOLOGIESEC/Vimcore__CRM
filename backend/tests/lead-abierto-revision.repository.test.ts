import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import * as leadAbiertoRevisionRepository from "../src/repositories/lead-abierto-revision.repository.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

/**
 * Bloque B (Fase 3, diseño "Ambiguity persistence (NEW)"): upsert idempotente
 * sobre la tripleta única `(clienteId, leadAbiertoId, empresaIngestaId)`.
 */
let contador = 0;

async function crearClienteYLead(): Promise<{ clienteId: string; leadId: string }> {
  contador += 1;
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente revision ${contador}`, telefonoValido: false },
  });
  const lead = await prisma.lead.create({
    data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: EMPRESA_BOOTSTRAP_ID },
  });
  return { clienteId: cliente.id, leadId: lead.id };
}

describe("repositories/lead-abierto-revision — upsertRevisionPendiente", () => {
  it("crea una fila con los 4 campos de la colisión", async () => {
    const { clienteId, leadId } = await crearClienteYLead();
    const empresaLeadId = "00000000-0000-0000-0000-000000000001";
    const empresaIngestaId = "00000000-0000-0000-0000-000000000002";

    const fila = await leadAbiertoRevisionRepository.upsertRevisionPendiente({
      clienteId,
      leadAbiertoId: leadId,
      empresaLeadId,
      empresaIngestaId,
    });

    expect(fila.clienteId).toBe(clienteId);
    expect(fila.leadAbiertoId).toBe(leadId);
    expect(fila.empresaLeadId).toBe(empresaLeadId);
    expect(fila.empresaIngestaId).toBe(empresaIngestaId);
    expect(fila.resuelto).toBe(false);
  });

  it("es idempotente: una segunda llamada con la misma tripleta no duplica la fila", async () => {
    const { clienteId, leadId } = await crearClienteYLead();
    const empresaLeadId = "00000000-0000-0000-0000-000000000001";
    const empresaIngestaId = "00000000-0000-0000-0000-000000000002";

    const primera = await leadAbiertoRevisionRepository.upsertRevisionPendiente({
      clienteId,
      leadAbiertoId: leadId,
      empresaLeadId,
      empresaIngestaId,
    });
    const segunda = await leadAbiertoRevisionRepository.upsertRevisionPendiente({
      clienteId,
      leadAbiertoId: leadId,
      empresaLeadId,
      empresaIngestaId,
    });

    expect(segunda.id).toBe(primera.id);
    const total = await prisma.leadAbiertoRevisionPendiente.count({
      where: { clienteId, leadAbiertoId: leadId, empresaIngestaId },
    });
    expect(total).toBe(1);
  });
});

