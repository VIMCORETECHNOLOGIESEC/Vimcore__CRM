import { describe, expect, it } from "vitest";
import {
  FORMULARIOS,
  getFormulario,
  type FormularioEtapa,
} from "../src/config/formularios.js";

/** Σ peso_pregunta (docs/04 §3-§5, "Peso total"). */
function sumaPesos(formulario: FormularioEtapa): number {
  return formulario.preguntas.reduce((total, pregunta) => total + pregunta.peso, 0);
}

describe("config/formularios — contrato técnico (docs/04 §9, D12)", () => {
  it("expone exactamente las 5 etapas documentadas", () => {
    expect(Object.keys(FORMULARIOS).sort()).toEqual(
      ["CITA", "CONTACTADO", "NO_VENTA", "NUEVO", "VENTA"].sort(),
    );
  });

  it("cada FormularioEtapa declara version y calificable propios de la etapa (D6)", () => {
    for (const etapa of Object.keys(FORMULARIOS) as Array<keyof typeof FORMULARIOS>) {
      const formulario = FORMULARIOS[etapa];
      expect(formulario.etapa).toBe(etapa);
      expect(formulario.version).toBe("v1");
    }
  });

  it("NUEVO: peso total 11 (docs/04 §3)", () => {
    expect(sumaPesos(FORMULARIOS.NUEVO)).toBe(11);
    expect(FORMULARIOS.NUEVO.calificable).toBe(true);
    expect(FORMULARIOS.NUEVO.preguntas).toHaveLength(5);
  });

  it("CONTACTADO: peso total 13 (docs/04 §4)", () => {
    expect(sumaPesos(FORMULARIOS.CONTACTADO)).toBe(13);
    expect(FORMULARIOS.CONTACTADO.calificable).toBe(true);
    expect(FORMULARIOS.CONTACTADO.preguntas).toHaveLength(6);
  });

  it("CITA: peso total 14 (docs/04 §5)", () => {
    expect(sumaPesos(FORMULARIOS.CITA)).toBe(14);
    expect(FORMULARIOS.CITA.calificable).toBe(true);
    expect(FORMULARIOS.CITA.preguntas).toHaveLength(6);
  });

  it("VENTA y NO_VENTA: calificable=false y sin preguntas (D6)", () => {
    expect(FORMULARIOS.VENTA.calificable).toBe(false);
    expect(FORMULARIOS.VENTA.preguntas).toEqual([]);
    expect(FORMULARIOS.NO_VENTA.calificable).toBe(false);
    expect(FORMULARIOS.NO_VENTA.preguntas).toEqual([]);
  });

  it("cada opción vale entre 0 y 10 y cada clave de opción es única dentro de su pregunta", () => {
    for (const formulario of Object.values(FORMULARIOS)) {
      for (const pregunta of formulario.preguntas) {
        const claves = pregunta.opciones.map((o) => o.clave);
        expect(new Set(claves).size).toBe(claves.length);
        for (const opcion of pregunta.opciones) {
          expect(opcion.valor).toBeGreaterThanOrEqual(0);
          expect(opcion.valor).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it("getFormulario(etapa) devuelve el mismo objeto que FORMULARIOS[etapa]", () => {
    expect(getFormulario("CONTACTADO")).toBe(FORMULARIOS.CONTACTADO);
  });
});
