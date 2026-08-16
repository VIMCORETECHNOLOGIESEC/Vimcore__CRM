import { describe, expect, it } from "vitest";
import { calculateSemaforo, calculatePuntuacion, GUIA_ACCION_SEMAFORO } from "@/funcionalidades/leads/detalle/puntuacion";
import { getFormularioEtapa } from "@/funcionalidades/leads/detalle/formulariosEtapa";
import type { FormularioEtapa } from "@/tipos/formulario";

const FORMULARIO_DOS_PREGUNTAS: FormularioEtapa = {
  etapa: "NUEVO",
  preguntas: [
    {
      clave: "p1",
      etiqueta: "Pregunta 1",
      peso: 3,
      opciones: [
        { valor: "SI", etiqueta: "Sí", puntaje: 10 },
        { valor: "PARCIAL", etiqueta: "Parcial", puntaje: 5 },
        { valor: "NO", etiqueta: "No", puntaje: 0 },
      ],
    },
    {
      clave: "p2",
      etiqueta: "Pregunta 2",
      peso: 2,
      opciones: [
        { valor: "SI", etiqueta: "Sí", puntaje: 10 },
        { valor: "NO", etiqueta: "No", puntaje: 0 },
      ],
    },
  ],
};

describe("calculatePuntuacion", () => {
  it("da 100 cuando todas las respuestas eligen la opción de máximo puntaje", () => {
    expect(calculatePuntuacion(FORMULARIO_DOS_PREGUNTAS, { p1: "SI", p2: "SI" })).toBe(100);
  });

  it("da 0 cuando todas las respuestas eligen la opción de mínimo puntaje", () => {
    expect(calculatePuntuacion(FORMULARIO_DOS_PREGUNTAS, { p1: "NO", p2: "NO" })).toBe(0);
  });

  it("pondera por el peso de cada pregunta, no por cantidad de preguntas", () => {
    // numerador = 3*10 (p1=SI) + 2*0 (p2=NO) = 30; denominador = (3+2)*10 = 50 -> 60
    expect(calculatePuntuacion(FORMULARIO_DOS_PREGUNTAS, { p1: "SI", p2: "NO" })).toBe(60);
  });

  it("redondea el resultado a un entero", () => {
    // numerador = 3*5 (p1=PARCIAL) + 2*10 (p2=SI) = 35; denominador = 50 -> 70
    expect(calculatePuntuacion(FORMULARIO_DOS_PREGUNTAS, { p1: "PARCIAL", p2: "SI" })).toBe(70);
  });

  it("una pregunta sin responder cuenta en el denominador pero no aporta al numerador", () => {
    // numerador = 3*10 (p1=SI); denominador = (3+2)*10 = 50 -> 60
    expect(calculatePuntuacion(FORMULARIO_DOS_PREGUNTAS, { p1: "SI" })).toBe(60);
  });

  it("un formulario totalmente vacío puntúa 0", () => {
    expect(calculatePuntuacion(FORMULARIO_DOS_PREGUNTAS, {})).toBe(0);
  });

  it("una respuesta con valor que no existe entre las opciones se ignora, como si no se hubiera respondido", () => {
    expect(calculatePuntuacion(FORMULARIO_DOS_PREGUNTAS, { p1: "NO_EXISTE", p2: "SI" })).toBe(40);
  });
});

describe("calculateSemaforo — rangos (docs/02-reglas-negocio.md 'Semáforo')", () => {
  it("0-39 es ROJO", () => {
    expect(calculateSemaforo(0)).toBe("ROJO");
    expect(calculateSemaforo(39)).toBe("ROJO");
  });

  it("40-69 es AMARILLO", () => {
    expect(calculateSemaforo(40)).toBe("AMARILLO");
    expect(calculateSemaforo(69)).toBe("AMARILLO");
  });

  it("70-100 es VERDE", () => {
    expect(calculateSemaforo(70)).toBe("VERDE");
    expect(calculateSemaforo(100)).toBe("VERDE");
  });
});

describe("GUIA_ACCION_SEMAFORO", () => {
  it("tiene un texto de guía distinto para cada color", () => {
    expect(GUIA_ACCION_SEMAFORO.VERDE).not.toBe(GUIA_ACCION_SEMAFORO.AMARILLO);
    expect(GUIA_ACCION_SEMAFORO.AMARILLO).not.toBe(GUIA_ACCION_SEMAFORO.ROJO);
  });
});

describe("getFormularioEtapa — pesos totales documentados (docs/02 'Puntuación')", () => {
  it("NUEVO suma peso total 11", () => {
    const total = getFormularioEtapa("NUEVO").preguntas.reduce((acc, p) => acc + p.peso, 0);
    expect(total).toBe(11);
  });

  it("CONTACTADO suma peso total 13", () => {
    const total = getFormularioEtapa("CONTACTADO").preguntas.reduce((acc, p) => acc + p.peso, 0);
    expect(total).toBe(13);
  });

  it("CITA suma peso total 14", () => {
    const total = getFormularioEtapa("CITA").preguntas.reduce((acc, p) => acc + p.peso, 0);
    expect(total).toBe(14);
  });
});
