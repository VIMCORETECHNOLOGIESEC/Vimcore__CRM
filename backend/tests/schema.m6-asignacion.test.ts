import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

/**
 * M6 (D6/DD3, diseño): verificación de la migración M6 contra la base de
 * pruebas real (ya migrada por `prisma migrate deploy` antes de
 * `pnpm test`), mismo patrón que `schema.m5-gestion-leads.test.ts`.
 */
afterAll(async () => {
  await prisma.$disconnect();
});

describe("schema M6 — SIN_ASIGNAR en el enum tipo_evento_lead (D6)", () => {
  it("SIN_ASIGNAR existe en pg_enum para tipo_evento_lead", async () => {
    const valores = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'tipo_evento_lead'
    `;
    const etiquetas = valores.map((v) => v.enumlabel);

    expect(etiquetas).toContain("SIN_ASIGNAR");
  });

  it("un lead_eventos puede persistirse con tipo SIN_ASIGNAR (round-trip real, no mockeado)", async () => {
    const cliente = await prisma.cliente.create({
      data: { nombre: "Cliente schema M6", telefonoValido: false },
    });
    const lead = await testAdminPrisma.lead.create({
      data: { clienteId: cliente.id, origen: "NUEVO", etapa: "NUEVO", ingresadoEn: new Date(), empresaId: EMPRESA_BOOTSTRAP_ID },
    });

    const evento = await testAdminPrisma.leadEvento.create({
      data: { leadId: lead.id, empresaId: EMPRESA_BOOTSTRAP_ID, tipo: "SIN_ASIGNAR" },
    });

    expect(evento.tipo).toBe("SIN_ASIGNAR");
  });
});
