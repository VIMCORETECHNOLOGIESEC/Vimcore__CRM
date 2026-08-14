import { describe, expect, it } from "vitest";
import {
  DEDUPLICACION_TRANSACTION_BOUNDS,
  INGESTA_TRANSACTION_BOUNDS,
} from "../src/lib/prisma.js";
import { prisma } from "../src/lib/prisma.js";
import { deduplicarLead, type DeduplicacionInput } from "../src/services/deduplicacion.service.js";

let contadorTelefono = 0;

/** EC móvil válido y único por llamada — evita colisión entre pruebas. */
function telefonoUnico(): string {
  contadorTelefono += 1;
  return `098${String(contadorTelefono).padStart(7, "0")}`;
}

function entradaBase(overrides: Partial<DeduplicacionInput> = {}): DeduplicacionInput {
  return {
    nombre: "Cliente PR0",
    telefono: telefonoUnico(),
    correo: null,
    ingresadoEn: new Date(),
    ...overrides,
  };
}

describe("lib/prisma — runInTransaction (M4, DD1c/DD3)", () => {
  it("INGESTA_TRANSACTION_BOUNDS es igual-o-más-amplio que DEDUPLICACION_TRANSACTION_BOUNDS (derivado, no hardcodeado)", () => {
    expect(INGESTA_TRANSACTION_BOUNDS.maxWait).toBeGreaterThanOrEqual(
      DEDUPLICACION_TRANSACTION_BOUNDS.maxWait,
    );
    expect(INGESTA_TRANSACTION_BOUNDS.timeout).toBeGreaterThanOrEqual(
      DEDUPLICACION_TRANSACTION_BOUNDS.timeout,
    );
  });
});

describe("deduplicacion.service — deduplicarLead(txExterna) (M4, PR0)", () => {
  it("txExterna omitido: deduplicarLead abre su propia transacción, exactamente igual que antes del seam", async () => {
    const entrada = entradaBase();
    const resultado = await deduplicarLead(entrada);

    expect(resultado.clienteCreado).toBe(true);
    expect(resultado.leadCreado).toBe(true);

    // Sin `txExterna`, las escrituras deben quedar comprometidas de inmediato
    // (la propia transacción de deduplicarLead ya hizo commit).
    const cliente = await prisma.cliente.findUniqueOrThrow({
      where: { id: resultado.clienteId },
    });
    expect(cliente.id).toBe(resultado.clienteId);
  });

  it("txExterna suministrado: las escrituras de deduplicarLead viven dentro de esa transacción, no en una propia", async () => {
    const telefono = telefonoUnico();
    let clienteId: string | undefined;
    let leadId: string | undefined;

    await expect(
      prisma.$transaction(async (tx) => {
        const resultado = await deduplicarLead(entradaBase({ telefono }), undefined, tx);
        clienteId = resultado.clienteId;
        leadId = resultado.leadId;
        throw new Error("rollback forzado del llamador externo");
      }),
    ).rejects.toThrow("rollback forzado del llamador externo");

    // Si deduplicarLead hubiera abierto su propia transacción interna (en vez
    // de usar `tx`), estas filas habrían quedado comprometidas pese al
    // rollback del llamador externo. Que no existan prueba que comparten una
    // única transacción (precondición DD2 de "no segunda conexión").
    const totalClientes = await prisma.cliente.count({ where: { id: clienteId } });
    expect(totalClientes).toBe(0);
    const totalLeads = await prisma.lead.count({ where: { id: leadId } });
    expect(totalLeads).toBe(0);
  });
});
