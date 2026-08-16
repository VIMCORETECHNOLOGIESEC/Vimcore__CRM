import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetNotificacionesMockParaTests,
  fetchNotificacionesApi,
  markNotificacionLeidaApi,
  markAllNotificacionesLeidasApi,
} from "@/funcionalidades/notificaciones/notificaciones.api";

beforeEach(() => {
  _resetNotificacionesMockParaTests();
});

describe("fetchNotificacionesApi — siembra perezosa por usuario", () => {
  it("crea un set de ejemplo la primera vez que se pide para un usuario", async () => {
    const notificaciones = await fetchNotificacionesApi("usuario-1");
    expect(notificaciones.length).toBeGreaterThan(0);
    expect(notificaciones.every((n) => n.usuarioId === "usuario-1")).toBe(true);
  });

  it("devuelve el mismo estado en llamadas sucesivas (persistencia en memoria)", async () => {
    const primera = await fetchNotificacionesApi("usuario-2");
    const segunda = await fetchNotificacionesApi("usuario-2");
    expect(segunda.map((n) => n.id)).toEqual(primera.map((n) => n.id));
  });

  it("no mezcla notificaciones entre usuarios distintos", async () => {
    const usuario1 = await fetchNotificacionesApi("usuario-a");
    const usuario2 = await fetchNotificacionesApi("usuario-b");
    expect(usuario1.every((n) => n.usuarioId === "usuario-a")).toBe(true);
    expect(usuario2.every((n) => n.usuarioId === "usuario-b")).toBe(true);
  });

  it("ordena de más reciente a más antigua por creadaEn", async () => {
    const notificaciones = await fetchNotificacionesApi("usuario-3");
    const fechas = notificaciones.map((n) => new Date(n.creadaEn).getTime());
    const ordenadasDesc = [...fechas].sort((a, b) => b - a);
    expect(fechas).toEqual(ordenadasDesc);
  });

  it("filtra solo no leídas cuando soloNoLeidas es true", async () => {
    const todas = await fetchNotificacionesApi("usuario-4");
    const noLeidas = await fetchNotificacionesApi("usuario-4", true);
    expect(noLeidas.every((n) => n.leidaEn === null)).toBe(true);
    expect(noLeidas.length).toBeLessThan(todas.length);
    expect(noLeidas.length).toBeGreaterThan(0);
  });

  it("incluye notificaciones con y sin leadId asociado", async () => {
    const notificaciones = await fetchNotificacionesApi("usuario-5");
    expect(notificaciones.some((n) => n.leadId !== null)).toBe(true);
    expect(notificaciones.some((n) => n.leadId === null)).toBe(true);
  });
});

describe("markNotificacionLeidaApi", () => {
  it("marca una notificación puntual como leída", async () => {
    const [primera] = await fetchNotificacionesApi("usuario-6", true);
    expect(primera.leidaEn).toBeNull();

    await markNotificacionLeidaApi("usuario-6", primera.id);

    const actualizadas = await fetchNotificacionesApi("usuario-6");
    const actualizada = actualizadas.find((n) => n.id === primera.id);
    expect(actualizada?.leidaEn).not.toBeNull();
  });

  it("no afecta a otras notificaciones del mismo usuario", async () => {
    const antes = await fetchNotificacionesApi("usuario-7");
    const [objetivo, otra] = antes;

    await markNotificacionLeidaApi("usuario-7", objetivo.id);

    const despues = await fetchNotificacionesApi("usuario-7");
    const otraDespues = despues.find((n) => n.id === otra.id);
    expect(otraDespues?.leidaEn).toBe(otra.leidaEn);
  });

  it("no lanza error al marcar una notificación inexistente", async () => {
    await expect(
      markNotificacionLeidaApi("usuario-8", "id-inexistente"),
    ).resolves.toBeUndefined();
  });
});

describe("markAllNotificacionesLeidasApi", () => {
  it("marca todas las notificaciones del usuario como leídas", async () => {
    await markAllNotificacionesLeidasApi("usuario-9");
    const notificaciones = await fetchNotificacionesApi("usuario-9");
    expect(notificaciones.every((n) => n.leidaEn !== null)).toBe(true);
  });

  it("no afecta las notificaciones de otro usuario", async () => {
    await fetchNotificacionesApi("usuario-10");
    await fetchNotificacionesApi("usuario-11");

    await markAllNotificacionesLeidasApi("usuario-10");

    const usuario11 = await fetchNotificacionesApi("usuario-11", true);
    expect(usuario11.length).toBeGreaterThan(0);
  });
});
