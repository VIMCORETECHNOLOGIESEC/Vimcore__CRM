import { describe, expect, it } from "vitest";
import { UMBRAL_VERDE } from "../src/config/negocio.js";
import type { FormularioEtapa } from "../src/config/formularios.js";
import { calculatePuntuacion } from "../src/services/semaforo.calculator.js";

/**
 * Formulario sintético de peso total 10 (2 preguntas de peso 5 cada una),
 * elegido para que el porcentaje resultante caiga exactamente sobre los
 * umbrales de docs/04 §2 sin redondeos ambiguos.
 */
const FORMULARIO_PRUEBA: FormularioEtapa = {
  etapa: "NUEVO",
  version: "v-test",
  calificable: true,
  preguntas: [
    {
      clave: "p1",
      etiqueta: "Pregunta 1",
      peso: 5,
      opciones: [
        { clave: "alto", etiqueta: "Alto", valor: 10 },
        { clave: "medio", etiqueta: "Medio", valor: 5 },
        { clave: "bajo", etiqueta: "Bajo", valor: 0 },
      ],
    },
    {
      clave: "p2",
      etiqueta: "Pregunta 2",
      peso: 5,
      opciones: [
        { clave: "alto", etiqueta: "Alto", valor: 10 },
        { clave: "medio", etiqueta: "Medio", valor: 5 },
        { clave: "bajo", etiqueta: "Bajo", valor: 0 },
      ],
    },
  ],
};

describe("services/semaforo.calculator — calculatePuntuacion (pura, sin BD, DD3)", () => {
  it("respuestas máximas en todas las preguntas → 100 puntos, VERDE", () => {
    const resultado = calculatePuntuacion(FORMULARIO_PRUEBA, { p1: "alto", p2: "alto" });

    expect(resultado.puntuacion).toBe(100);
    expect(resultado.semaforo).toBe("VERDE");
  });

  it("respuestas mínimas en todas las preguntas → 0 puntos, ROJO", () => {
    const resultado = calculatePuntuacion(FORMULARIO_PRUEBA, { p1: "bajo", p2: "bajo" });

    expect(resultado.puntuacion).toBe(0);
    expect(resultado.semaforo).toBe("ROJO");
  });

  it("Σ(peso×valor)/Σ(peso×10)×100 se calcula con los pesos y valores exactos del formulario, no un promedio simple", () => {
    // p1=alto(10, peso 5) + p2=medio(5, peso 5) => (5*10 + 5*5) / (10*10) * 100 = 75
    const resultado = calculatePuntuacion(FORMULARIO_PRUEBA, { p1: "alto", p2: "medio" });

    expect(resultado.puntuacion).toBe(75);
    expect(resultado.semaforo).toBe("VERDE");
  });

  it(`umbral exacto ${UMBRAL_VERDE - 1}: ROJO/AMARILLO por debajo de VERDE, límite estricto`, () => {
    // (5*8 + 5*8)/100*100 = 80... usamos un formulario de una sola pregunta peso 10 para clavar 69/70 exactos.
    const formularioUnaPregunta: FormularioEtapa = {
      etapa: "NUEVO",
      version: "v-test",
      calificable: true,
      preguntas: [
        {
          clave: "p1",
          etiqueta: "Pregunta única",
          peso: 10,
          opciones: [
            { clave: "v70", etiqueta: "70", valor: 7 },
            { clave: "v69", etiqueta: "69,9→69 truncado", valor: 6.9 },
            { clave: "v40", etiqueta: "40", valor: 4 },
            { clave: "v39", etiqueta: "39", valor: 3.9 },
          ],
        },
      ],
    };

    expect(
      calculatePuntuacion(formularioUnaPregunta, { p1: "v70" }).semaforo,
    ).toBe("VERDE");
    expect(
      calculatePuntuacion(formularioUnaPregunta, { p1: "v69" }).puntuacion,
    ).toBe(69);
    expect(
      calculatePuntuacion(formularioUnaPregunta, { p1: "v69" }).semaforo,
    ).toBe("AMARILLO");
    expect(
      calculatePuntuacion(formularioUnaPregunta, { p1: "v40" }).semaforo,
    ).toBe("AMARILLO");
    expect(
      calculatePuntuacion(formularioUnaPregunta, { p1: "v39" }).puntuacion,
    ).toBe(39);
    expect(
      calculatePuntuacion(formularioUnaPregunta, { p1: "v39" }).semaforo,
    ).toBe("ROJO");
  });

  it("D7: una clave de opción que no existe en la pregunta contribuye 0 al puntaje, nunca lanza", () => {
    const resultado = calculatePuntuacion(FORMULARIO_PRUEBA, {
      p1: "clave-inventada-por-el-cliente",
      p2: "alto",
    });

    // (5*0 + 5*10) / 100 * 100 = 50
    expect(resultado.puntuacion).toBe(50);
    expect(resultado.semaforo).toBe("AMARILLO");
  });

  it("D7: una pregunta sin respuesta en el body contribuye 0, el cliente no puede omitir para inflar el promedio", () => {
    const resultado = calculatePuntuacion(FORMULARIO_PRUEBA, { p1: "alto" });

    // (5*10 + 5*0) / 100 * 100 = 50 — el denominador sigue siendo el peso TOTAL del formulario.
    expect(resultado.puntuacion).toBe(50);
    expect(resultado.semaforo).toBe("AMARILLO");
  });

  it("ignora cualquier `puntuacion`/`semaforo` que venga inyectado en el objeto de respuestas (D7, defensa estructural)", () => {
    const respuestasConInyeccion = {
      p1: "alto",
      p2: "alto",
      puntuacion: 999,
      semaforo: "VERDE",
    } as unknown as Record<string, string>;

    const resultado = calculatePuntuacion(FORMULARIO_PRUEBA, respuestasConInyeccion);

    expect(resultado.puntuacion).toBe(100);
  });
});
