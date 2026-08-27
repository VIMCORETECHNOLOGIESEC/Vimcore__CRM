import { beforeAll, describe, expect, it } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import {
  DEDUPLICACION_TRANSACTION_BOUNDS,
  INGESTA_TRANSACTION_BOUNDS,
} from "../src/lib/prisma.js";
import { prisma } from "../src/lib/prisma.js";
import { deduplicateLead, type DeduplicacionInput } from "../src/services/deduplicacion.service.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

let contadorTelefono = 0;

/** EC móvil válido y único por llamada — evita colisión entre pruebas. */
function telefonoUnico(): string {
  contadorTelefono += 1;
  return `098${String(contadorTelefono).padStart(7, "0")}`;
}

// Bloque C (D4, Fase 2/Stage 2): `Lead.empresaId` es NOT NULL — `entradaBase`
// necesita un `bridgeId` resoluble para que `deduplicateLead` no rechace la
// creación (guard `empresa_no_resuelta`).
let DEFAULT_BRIDGE_ID: string;

beforeAll(async () => {
  const bridge = await prisma.bridge.create({
    data: {
      redSocial: "GOOGLE_FORMS",
      nombre: "Bridge PR0 runInTransaction",
      claveApiHash: hashClaveBridge("clave-pr0-runintransaction"),
      estado: "ACTIVO",
      empresaId: EMPRESA_BOOTSTRAP_ID,
    },
  });
  DEFAULT_BRIDGE_ID = bridge.id;
});

function entradaBase(overrides: Partial<DeduplicacionInput> = {}): DeduplicacionInput {
  return {
    nombre: "Cliente PR0",
    telefono: telefonoUnico(),
    correo: null,
    ingresadoEn: new Date(),
    bridgeId: DEFAULT_BRIDGE_ID,
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

describe("deduplicacion.service — deduplicateLead(txExterna) (M4, PR0)", () => {
  it("txExterna omitido: deduplicateLead abre su propia transacción, exactamente igual que antes del seam", async () => {
    const entrada = entradaBase();
    const resultado = await deduplicateLead(entrada);

    expect(resultado.clienteCreado).toBe(true);
    expect(resultado.leadCreado).toBe(true);

    // Sin `txExterna`, las escrituras deben quedar comprometidas de inmediato
    // (la propia transacción de deduplicateLead ya hizo commit).
    const cliente = await prisma.cliente.findUniqueOrThrow({
      where: { id: resultado.clienteId },
    });
    expect(cliente.id).toBe(resultado.clienteId);
  });

  it("txExterna suministrado: las escrituras de deduplicateLead viven dentro de esa transacción, no en una propia", async () => {
    const telefono = telefonoUnico();
    let clienteId: string | undefined;
    let leadId: string | undefined;

    await expect(
      prisma.$transaction(async (tx) => {
        const resultado = await deduplicateLead(entradaBase({ telefono }), undefined, tx);
        clienteId = resultado.clienteId;
        leadId = resultado.leadId;
        throw new Error("rollback forzado del llamador externo");
      }),
    ).rejects.toThrow("rollback forzado del llamador externo");

    // Si deduplicateLead hubiera abierto su propia transacción interna (en vez
    // de usar `tx`), estas filas habrían quedado comprometidas pese al
    // rollback del llamador externo. Que no existan prueba que comparten una
    // única transacción (precondición DD2 de "no segunda conexión").
    const totalClientes = await prisma.cliente.count({ where: { id: clienteId } });
    expect(totalClientes).toBe(0);
    const totalLeads = await prisma.lead.count({ where: { id: leadId } });
    expect(totalLeads).toBe(0);
  });
});
