import { describe, expect, it } from "vitest";
import { decideAccionDeduplicacion, type DeduplicacionState } from "../src/services/deduplicacion.decider.js";

const AHORA = new Date("2026-08-13T12:00:00.000Z");
const DIA_MS = 24 * 60 * 60 * 1000;

function haceDias(dias: number): Date {
  return new Date(AHORA.getTime() - dias * DIA_MS);
}

describe("services/deduplicacion.decider — decideAccionDeduplicacion (pura, sin BD)", () => {
  it("sin leads previos -> crear_lead NUEVO", () => {
    const estado: DeduplicacionState = { clienteId: "c1", leadAbierto: null, ultimoLeadCerrado: null };

    expect(decideAccionDeduplicacion(estado, AHORA)).toEqual({ kind: "crear_lead", origen: "NUEVO" });
  });

  it("lead abierto -> interaccion_repetida / lead_abierto, gana sobre cualquier historial cerrado", () => {
    const estado: DeduplicacionState = {
      clienteId: "c1",
      leadAbierto: { id: "lead-abierto" },
      ultimoLeadCerrado: { id: "lead-cerrado", cerradoEn: haceDias(200) },
    };

    expect(decideAccionDeduplicacion(estado, AHORA)).toEqual({
      kind: "interaccion_repetida",
      leadId: "lead-abierto",
      motivo: "lead_abierto",
    });
  });

  it("cerrado hace 89 dias -> interaccion_repetida / lead_cerrado_en_ventana", () => {
    const estado: DeduplicacionState = {
      clienteId: "c1",
      leadAbierto: null,
      ultimoLeadCerrado: { id: "lead-cerrado", cerradoEn: haceDias(89) },
    };

    expect(decideAccionDeduplicacion(estado, AHORA)).toEqual({
      kind: "interaccion_repetida",
      leadId: "lead-cerrado",
      motivo: "lead_cerrado_en_ventana",
      diasDesdeCierre: 89,
    });
  });

  it("cerrado hace exactamente 90 dias (limite estricto) -> interaccion_repetida, NO reingreso", () => {
    const estado: DeduplicacionState = {
      clienteId: "c1",
      leadAbierto: null,
      ultimoLeadCerrado: { id: "lead-cerrado", cerradoEn: haceDias(90) },
    };

    expect(decideAccionDeduplicacion(estado, AHORA)).toEqual({
      kind: "interaccion_repetida",
      leadId: "lead-cerrado",
      motivo: "lead_cerrado_en_ventana",
      diasDesdeCierre: 90,
    });
  });

  it("cerrado hace 91 dias -> crear_lead REINGRESO", () => {
    const estado: DeduplicacionState = {
      clienteId: "c1",
      leadAbierto: null,
      ultimoLeadCerrado: { id: "lead-cerrado", cerradoEn: haceDias(91) },
    };

    expect(decideAccionDeduplicacion(estado, AHORA)).toEqual({ kind: "crear_lead", origen: "REINGRESO" });
  });

  it("multiples leads cerrados: el decisor solo confia en el ultimoLeadCerrado que le entrega el repositorio (mas reciente)", () => {
    const cierreMasAntiguo = haceDias(400);
    const cierreMasReciente = haceDias(45);
    const masReciente =
      cierreMasReciente.getTime() > cierreMasAntiguo.getTime()
        ? { id: "lead-reciente", cerradoEn: cierreMasReciente }
        : { id: "lead-antiguo", cerradoEn: cierreMasAntiguo };

    const estado: DeduplicacionState = { clienteId: "c1", leadAbierto: null, ultimoLeadCerrado: masReciente };

    expect(decideAccionDeduplicacion(estado, AHORA)).toEqual({
      kind: "interaccion_repetida",
      leadId: "lead-reciente",
      motivo: "lead_cerrado_en_ventana",
      diasDesdeCierre: 45,
    });
  });
});
