import { afterAll, describe, expect, it } from "vitest";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

/**
 * Bloque C (Etapa 3, tareas 2.1/2.4/2.5) — spec §1 "Fail-closed without
 * tenant context" + "Tenant context is per-request, never leaked", §2 "HTTP
 * request always uses application role" (holding-wide vía el rol de
 * aplicación, nunca `crm_bypass_jobs`).
 */
async function crearClienteYLead(empresaId: string): Promise<{ leadId: string }> {
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente RLS ${crypto.randomUUID()}`, telefonoValido: false },
  });
  const lead = await prisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: "NUEVO",
      ingresadoEn: new Date(),
      empresaId,
    },
  });
  return { leadId: lead.id };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("lib/prisma — fail-closed sin TenantContext (tarea 2.1)", () => {
  it("una query sin runWithTenantContext activo no ve filas de leads (ni error, ni tabla completa)", async () => {
    await runWithTenantContext({ empresaId: EMPRESA_BOOTSTRAP_ID }, async () => {
      await crearClienteYLead(EMPRESA_BOOTSTRAP_ID);
    });

    const leads = await prisma.lead.findMany();
    expect(leads).toEqual([]);
  });
});

describe("lib/prisma — contexto por-request, nunca se filtra entre transacciones (tarea 2.4)", () => {
  it("una segunda operación sin contexto no hereda el contexto de la anterior en la misma conexión pooled", async () => {
    let leadIdEmpresaA = "";
    await runWithTenantContext({ empresaId: EMPRESA_BOOTSTRAP_ID }, async () => {
      const { leadId } = await crearClienteYLead(EMPRESA_BOOTSTRAP_ID);
      leadIdEmpresaA = leadId;
      const visto = await prisma.lead.findUnique({ where: { id: leadId } });
      expect(visto?.id).toBe(leadId);
    });

    // Fuera de runWithTenantContext -- carrier vacío otra vez.
    const sinContexto = await prisma.lead.findUnique({ where: { id: leadIdEmpresaA } });
    expect(sinContexto).toBeNull();
  });
});

describe("lib/prisma — holding-wide vía rol de aplicación (tarea 2.5)", () => {
  it("empresaId null (unrestricted) lee leads de más de una empresa, nunca vía crm_bypass_jobs", async () => {
    const empresaB = await prisma.empresa.create({ data: { nombre: "Empresa RLS B" } });

    await runWithTenantContext({ empresaId: EMPRESA_BOOTSTRAP_ID }, async () => {
      await crearClienteYLead(EMPRESA_BOOTSTRAP_ID);
    });
    await runWithTenantContext({ empresaId: empresaB.id }, async () => {
      await crearClienteYLead(empresaB.id);
    });

    const total = await runWithTenantContext({ empresaId: null }, async () => {
      const rolActual = await prisma.$queryRaw<{ current_user: string }[]>`SELECT current_user`;
      expect(rolActual[0]?.current_user).not.toBe("crm_bypass_jobs");
      return prisma.lead.findMany({
        where: { empresaId: { in: [EMPRESA_BOOTSTRAP_ID, empresaB.id] } },
      });
    });

    const empresasVistas = new Set(total.map((l) => l.empresaId));
    expect(empresasVistas.has(EMPRESA_BOOTSTRAP_ID)).toBe(true);
    expect(empresasVistas.has(empresaB.id)).toBe(true);
  });
});
