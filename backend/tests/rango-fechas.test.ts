import { describe, expect, it } from "vitest";
import { rangoManianaEcuador, resolveRangoFechas } from "../src/lib/rango-fechas.js";

// Referencia fija: 2026-08-18T15:30:00.000Z (miércoles) — evita flakiness por
// hora de corrida.
const AHORA = new Date("2026-08-18T15:30:00.000Z");

describe("lib/rango-fechas — resolveRangoFechas (docs/08 §4)", () => {
  it("hoy: [00:00, 23:59:59.999] de hoy; anterior = mismo rango de ayer", () => {
    const r = resolveRangoFechas("hoy", AHORA);
    expect(r.desde.toISOString()).toBe("2026-08-18T00:00:00.000Z");
    expect(r.hasta.toISOString()).toBe("2026-08-18T23:59:59.999Z");
    expect(r.anteriorDesde.toISOString()).toBe("2026-08-17T00:00:00.000Z");
    expect(r.anteriorHasta.toISOString()).toBe("2026-08-17T23:59:59.999Z");
  });

  it("7d: [ahora-7d, ahora]; anterior contiguo de igual duración", () => {
    const r = resolveRangoFechas("7d", AHORA);
    expect(r.hasta.getTime()).toBe(AHORA.getTime());
    expect(r.desde.getTime()).toBe(AHORA.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(r.anteriorHasta.getTime()).toBe(r.desde.getTime());
    expect(r.anteriorDesde.getTime()).toBe(r.desde.getTime() - (r.hasta.getTime() - r.desde.getTime()));
  });

  it("30d: misma forma que 7d con ventana de 30 días", () => {
    const r = resolveRangoFechas("30d", AHORA);
    expect(r.desde.getTime()).toBe(AHORA.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(r.hasta.getTime()).toBe(AHORA.getTime());
    expect(r.anteriorHasta.getTime()).toBe(r.desde.getTime());
    expect(r.anteriorDesde.getTime()).toBe(r.desde.getTime() - 30 * 24 * 60 * 60 * 1000);
  });

  it("mes_actual: [1º del mes, ahora]; anterior = mes calendario previo COMPLETO", () => {
    const r = resolveRangoFechas("mes_actual", AHORA);
    expect(r.desde.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(r.hasta.getTime()).toBe(AHORA.getTime());
    expect(r.anteriorDesde.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(r.anteriorHasta.toISOString()).toBe("2026-07-31T23:59:59.999Z");
  });

  it("mes_anterior: mes calendario previo completo; anterior = dos meses atrás completo", () => {
    const r = resolveRangoFechas("mes_anterior", AHORA);
    expect(r.desde.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(r.hasta.toISOString()).toBe("2026-07-31T23:59:59.999Z");
    expect(r.anteriorDesde.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(r.anteriorHasta.toISOString()).toBe("2026-06-30T23:59:59.999Z");
  });

  it("mes_actual en enero: el mes previo completo es diciembre del año anterior", () => {
    const eneroRef = new Date("2026-01-15T10:00:00.000Z");
    const r = resolveRangoFechas("mes_actual", eneroRef);
    expect(r.anteriorDesde.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(r.anteriorHasta.toISOString()).toBe("2025-12-31T23:59:59.999Z");
  });

  it("personalizado: usa desde/hasta dados; anterior contiguo de igual duración", () => {
    const desde = new Date("2026-08-01T00:00:00.000Z");
    const hasta = new Date("2026-08-10T00:00:00.000Z");
    const r = resolveRangoFechas("personalizado", AHORA, desde, hasta);
    expect(r.desde.getTime()).toBe(desde.getTime());
    expect(r.hasta.getTime()).toBe(hasta.getTime());
    expect(r.anteriorHasta.getTime()).toBe(desde.getTime() - 1);
    expect(r.anteriorDesde.getTime()).toBe(desde.getTime() - 1 - (hasta.getTime() - desde.getTime()));
  });
});

// Vista de calendario (feature aditiva post-M7, `citas-recordatorio.service.ts`):
// Ecuador es UTC-5 fijo, sin horario de verano.
describe("lib/rango-fechas — rangoManianaEcuador (feature aditiva post-M7)", () => {
  it("mitad del día UTC (10:30 Ecuador un martes): mañana Ecuador = todo el miércoles siguiente en instantes UTC", () => {
    const r = rangoManianaEcuador(AHORA); // 2026-08-18T15:30:00.000Z = 10:30 Ecuador, martes 18
    expect(r.desde.toISOString()).toBe("2026-08-19T05:00:00.000Z");
    expect(r.hasta.toISOString()).toBe("2026-08-20T04:59:59.999Z");
  });

  it("madrugada UTC (22:00 Ecuador del día anterior): el día calendario Ecuador va un día atrás del día calendario UTC", () => {
    // 2026-08-18T03:00:00.000Z UTC es todavía 2026-08-17T22:00:00 en Ecuador
    // (UTC-5) -- el caso límite que justifica todo el truco de shift: si se
    // leyera el día calendario directo de `ahora` en UTC (sin restar el
    // offset primero), "mañana" daría el 19, no el 18.
    const madrugadaUTC = new Date("2026-08-18T03:00:00.000Z");
    const r = rangoManianaEcuador(madrugadaUTC);
    expect(r.desde.toISOString()).toBe("2026-08-18T05:00:00.000Z");
    expect(r.hasta.toISOString()).toBe("2026-08-19T04:59:59.999Z");
  });

  it("cruce de mes (31 de agosto Ecuador): mañana = 1° de septiembre completo", () => {
    const finDeMes = new Date("2026-08-31T20:00:00.000Z"); // 15:00 Ecuador, 31 de agosto
    const r = rangoManianaEcuador(finDeMes);
    expect(r.desde.toISOString()).toBe("2026-09-01T05:00:00.000Z");
    expect(r.hasta.toISOString()).toBe("2026-09-02T04:59:59.999Z");
  });
});
