import { describe, expect, it } from "vitest";
import type { Notificacion } from "@/tipos/notificacion";
import {
  countNoLeidas,
  formatFechaRelativa,
  sortByFechaDesc,
} from "@/funcionalidades/notificaciones/notificaciones.utils";

function notificacionFake(overrides: Partial<Notificacion> = {}): Notificacion {
  return {
    id: "notif-1",
    usuarioId: "u1",
    tipo: "LEAD_ASIGNADO",
    canal: "IN_APP",
    titulo: "Título",
    mensaje: "Mensaje",
    leadId: "lead-01",
    leidaEn: null,
    creadaEn: new Date().toISOString(),
    ...overrides,
  };
}

describe("countNoLeidas", () => {
  it("cuenta solo las notificaciones con leidaEn nulo", () => {
    const notificaciones = [
      notificacionFake({ id: "1", leidaEn: null }),
      notificacionFake({ id: "2", leidaEn: new Date().toISOString() }),
      notificacionFake({ id: "3", leidaEn: null }),
    ];
    expect(countNoLeidas(notificaciones)).toBe(2);
  });

  it("devuelve 0 con lista vacía", () => {
    expect(countNoLeidas([])).toBe(0);
  });

  it("devuelve 0 cuando todas están leídas", () => {
    const notificaciones = [
      notificacionFake({ leidaEn: new Date().toISOString() }),
      notificacionFake({ leidaEn: new Date().toISOString() }),
    ];
    expect(countNoLeidas(notificaciones)).toBe(0);
  });
});

describe("formatFechaRelativa", () => {
  const ahora = new Date("2026-08-14T12:00:00.000Z");

  it("muestra 'hace instantes' para menos de un minuto", () => {
    const hace30s = new Date(ahora.getTime() - 30 * 1000).toISOString();
    expect(formatFechaRelativa(hace30s, ahora)).toBe("hace instantes");
  });

  it("muestra minutos entre 1 minuto y 1 hora", () => {
    const hace5min = new Date(ahora.getTime() - 5 * 60 * 1000).toISOString();
    expect(formatFechaRelativa(hace5min, ahora)).toBe("hace 5 min");
  });

  it("muestra horas entre 1 hora y 24 horas", () => {
    const hace3h = new Date(ahora.getTime() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatFechaRelativa(hace3h, ahora)).toBe("hace 3 h");
  });

  it("muestra fecha absoluta DD/MM/AAAA HH:mm a partir de 24 horas", () => {
    const hace2dias = new Date(ahora.getTime() - 2 * 24 * 60 * 60 * 1000);
    const resultado = formatFechaRelativa(hace2dias.toISOString(), ahora);
    expect(resultado).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });
});

describe("sortByFechaDesc", () => {
  it("ordena de más reciente a más antigua sin mutar el arreglo original", () => {
    const antigua = notificacionFake({ id: "antigua", creadaEn: "2026-01-01T00:00:00.000Z" });
    const reciente = notificacionFake({ id: "reciente", creadaEn: "2026-06-01T00:00:00.000Z" });
    const original = [antigua, reciente];

    const ordenadas = sortByFechaDesc(original);

    expect(ordenadas.map((n) => n.id)).toEqual(["reciente", "antigua"]);
    expect(original.map((n) => n.id)).toEqual(["antigua", "reciente"]);
  });
});
