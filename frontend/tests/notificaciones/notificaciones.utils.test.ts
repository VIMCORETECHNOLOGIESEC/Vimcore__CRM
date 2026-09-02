import { describe, expect, it } from "vitest";
import type { Notificacion } from "@/tipos/notificacion";
import {
  countNoLeidas,
  formatFechaRelativa,
  resolveDestinoNotificacion,
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
    empresaId: null,
    metadata: null,
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

describe("resolveDestinoNotificacion", () => {
  it("prioriza el lead cuando existe", () => {
    const notificacion = notificacionFake({
      leadId: "lead-01",
      tipo: "WHATSAPP_MENSAJE_NUEVO",
      metadata: { conversacionId: "conv-1" },
    });
    expect(resolveDestinoNotificacion(notificacion)).toBe("/leads/lead-01");
  });

  it("sin lead, un WHATSAPP_MENSAJE_NUEVO con metadata.conversacionId navega a la conversación", () => {
    const notificacion = notificacionFake({
      leadId: null,
      tipo: "WHATSAPP_MENSAJE_NUEVO",
      metadata: { conversacionId: "conv-1" },
    });
    expect(resolveDestinoNotificacion(notificacion)).toBe("/conversaciones/conv-1");
  });

  it("sin lead ni metadata.conversacionId, no hay destino", () => {
    const notificacion = notificacionFake({ leadId: null, tipo: "ERROR_BRIDGE", metadata: null });
    expect(resolveDestinoNotificacion(notificacion)).toBeNull();
  });

  it("WHATSAPP_MENSAJE_NUEVO con metadata.conversacionId no-string ignora el deep-link", () => {
    const notificacion = notificacionFake({
      leadId: null,
      tipo: "WHATSAPP_MENSAJE_NUEVO",
      metadata: { conversacionId: 123 },
    });
    expect(resolveDestinoNotificacion(notificacion)).toBeNull();
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
