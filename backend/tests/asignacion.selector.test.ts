import { describe, expect, it } from "vitest";
import {
  chooseCandidato,
  type CandidatoAsignacion,
} from "../src/services/asignacion.service.js";

/**
 * M6 (DD7, diseño): `chooseCandidato` es PURA — sin BD, sin Prisma. Cubre las
 * pruebas obligatorias 1 y 2 (propuesta/spec).
 */
describe("asignacion.service — chooseCandidato (M6, DD7)", () => {
  it("prueba obligatoria 1: con cargas 3/1/2 elige al candidato de carga 1", () => {
    const candidatos: CandidatoAsignacion[] = [
      { id: "asesor-carga-3", ultimaAsignacionEn: null, cargaActiva: 3 },
      { id: "asesor-carga-1", ultimaAsignacionEn: null, cargaActiva: 1 },
      { id: "asesor-carga-2", ultimaAsignacionEn: null, cargaActiva: 2 },
    ];

    const elegido = chooseCandidato(candidatos);

    expect(elegido?.id).toBe("asesor-carga-1");
  });

  it("prueba obligatoria 2: en empate de carga, gana ultimaAsignacionEn mas antigua, y null cuenta como la mas antigua", () => {
    const candidatos: CandidatoAsignacion[] = [
      {
        id: "asesor-fecha-reciente",
        ultimaAsignacionEn: new Date("2026-08-01T00:00:00Z"),
        cargaActiva: 2,
      },
      { id: "asesor-nunca-asignado", ultimaAsignacionEn: null, cargaActiva: 2 },
    ];

    const elegido = chooseCandidato(candidatos);

    expect(elegido?.id).toBe("asesor-nunca-asignado");
  });

  it("desempate final deterministico por id ascendente cuando carga y ultimaAsignacionEn coinciden", () => {
    const fecha = new Date("2026-08-01T00:00:00Z");
    const candidatos: CandidatoAsignacion[] = [
      { id: "b-candidato", ultimaAsignacionEn: fecha, cargaActiva: 1 },
      { id: "a-candidato", ultimaAsignacionEn: fecha, cargaActiva: 1 },
    ];

    const elegido = chooseCandidato(candidatos);

    expect(elegido?.id).toBe("a-candidato");
  });
});
