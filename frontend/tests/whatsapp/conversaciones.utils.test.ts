import { describe, expect, it } from "vitest";
import type { Mensaje } from "@/tipos/conversacion";
import {
  combinarHistorial,
  formatearFechaHora,
  formatearHora,
  nombreConversacion,
} from "@/funcionalidades/whatsapp/conversaciones.utils";

/**
 * Lógica pura de presentación de la bandeja de conversaciones. Las
 * aserciones de fecha usan regex de forma (no un valor exacto) para no
 * depender de la zona horaria del entorno de test.
 */

function mensaje(id: string, enviadoEn: string, direccion: Mensaje["direccion"] = "ENTRANTE"): Mensaje {
  return { id, conversacionId: "conv-1", direccion, texto: `texto ${id}`, usuarioId: null, enviadoEn };
}

describe("formatearFechaHora", () => {
  it("devuelve DD/MM/AAAA HH:mm para un ISO válido", () => {
    expect(formatearFechaHora("2026-08-30T10:44:00.000Z")).toMatch(
      /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/,
    );
  });

  it("devuelve 'Sin actividad' cuando no hay fecha", () => {
    expect(formatearFechaHora(null)).toBe("Sin actividad");
    expect(formatearFechaHora(undefined)).toBe("Sin actividad");
  });

  it("devuelve cadena vacía ante una fecha inválida en vez de reventar", () => {
    expect(formatearFechaHora("no-es-fecha")).toBe("");
  });
});

describe("formatearHora", () => {
  it("devuelve HH:mm para un ISO válido", () => {
    expect(formatearHora("2026-08-30T10:44:00.000Z")).toMatch(/^\d{2}:\d{2}$/);
  });

  it("devuelve cadena vacía sin fecha o con fecha inválida", () => {
    expect(formatearHora(null)).toBe("");
    expect(formatearHora("x")).toBe("");
  });
});

describe("nombreConversacion", () => {
  it("prefiere el nombre del cliente", () => {
    expect(
      nombreConversacion({ clienteNombre: "Ana Gómez", clienteTelefono: "+54 11 5555" }),
    ).toBe("Ana Gómez");
  });

  it("cae al teléfono cuando no hay nombre", () => {
    expect(nombreConversacion({ clienteNombre: null, clienteTelefono: "+54 11 5555" })).toBe(
      "+54 11 5555",
    );
    expect(nombreConversacion({ clienteNombre: "   ", clienteTelefono: "+54 11 5555" })).toBe(
      "+54 11 5555",
    );
  });

  it("usa un texto honesto cuando no hay nombre ni teléfono", () => {
    expect(nombreConversacion({ clienteNombre: null, clienteTelefono: null })).toBe(
      "Cliente sin identificar",
    );
  });
});

describe("combinarHistorial", () => {
  it("aplana páginas 'enviadoEn desc' a una lista cronológica ascendente", () => {
    const pagina1 = [
      mensaje("m4", "2026-08-30T10:04:00.000Z"),
      mensaje("m3", "2026-08-30T10:03:00.000Z"),
    ];
    const pagina2 = [
      mensaje("m2", "2026-08-30T10:02:00.000Z"),
      mensaje("m1", "2026-08-30T10:01:00.000Z"),
    ];

    const combinado = combinarHistorial([pagina1, pagina2]);

    expect(combinado.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("deduplica por id cuando una recarga trae mensajes ya conocidos", () => {
    const pagina1 = [mensaje("m2", "2026-08-30T10:02:00.000Z")];
    const recarga = [
      mensaje("m2", "2026-08-30T10:02:00.000Z"),
      mensaje("m1", "2026-08-30T10:01:00.000Z"),
    ];

    const combinado = combinarHistorial([pagina1, recarga]);

    expect(combinado.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("con cero páginas devuelve lista vacía", () => {
    expect(combinarHistorial([])).toEqual([]);
  });
});
