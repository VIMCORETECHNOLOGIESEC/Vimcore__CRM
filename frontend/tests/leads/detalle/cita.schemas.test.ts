import { describe, expect, it } from "vitest";
import { citaRescheduleSchema, citaScheduleSchema } from "@/funcionalidades/leads/detalle/cita.schemas";

function enHoras(horas: number): string {
  return new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();
}

describe("citaScheduleSchema (docs/07 F4, 'no permite fecha pasada')", () => {
  it("acepta una fecha futura", () => {
    expect(
      citaScheduleSchema.safeParse({ programadaPara: enHoras(24), modalidad: "VIRTUAL" }).success,
    ).toBe(true);
  });

  it("rechaza una fecha pasada", () => {
    expect(
      citaScheduleSchema.safeParse({ programadaPara: enHoras(-1), modalidad: "PRESENCIAL" }).success,
    ).toBe(false);
  });

  it("rechaza una modalidad fuera del catálogo", () => {
    expect(
      citaScheduleSchema.safeParse({ programadaPara: enHoras(24), modalidad: "CHAT" }).success,
    ).toBe(false);
  });
});

describe("citaRescheduleSchema", () => {
  it("rechaza reprogramar a una fecha pasada", () => {
    expect(citaRescheduleSchema.safeParse({ programadaPara: enHoras(-2) }).success).toBe(false);
  });

  it("acepta reprogramar a una fecha futura", () => {
    expect(citaRescheduleSchema.safeParse({ programadaPara: enHoras(2) }).success).toBe(true);
  });
});
