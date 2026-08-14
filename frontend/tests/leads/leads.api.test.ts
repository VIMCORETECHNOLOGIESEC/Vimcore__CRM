import { beforeEach, describe, expect, it } from "vitest";
import {
  assignLeadsMasivoApi,
  fetchLeadsApi,
  getLeadsActivosDeUsuario,
} from "@/funcionalidades/leads/leads.api";

const PAGINA_1 = { pagina: 1, porPagina: 50 };

describe("fetchLeadsApi — contrato de respuesta", () => {
  it("devuelve datos, total, pagina y porPagina (misma forma que tendrá GET /api/v1/leads)", async () => {
    const respuesta = await fetchLeadsApi(PAGINA_1);
    expect(respuesta).toHaveProperty("datos");
    expect(respuesta).toHaveProperty("total");
    expect(respuesta.pagina).toBe(1);
    expect(respuesta.porPagina).toBe(50);
    expect(respuesta.total).toBeGreaterThan(0);
    expect(respuesta.datos.length).toBeGreaterThan(0);
  });
});

describe("fetchLeadsApi — paginación en memoria", () => {
  it("respeta porPagina y avanza de página sin repetir leads", async () => {
    const pagina1 = await fetchLeadsApi({ pagina: 1, porPagina: 5 });
    const pagina2 = await fetchLeadsApi({ pagina: 2, porPagina: 5 });

    expect(pagina1.datos).toHaveLength(5);
    expect(pagina2.datos).toHaveLength(5);
    const idsPagina1 = pagina1.datos.map((l) => l.id);
    const idsPagina2 = pagina2.datos.map((l) => l.id);
    expect(idsPagina1.some((id) => idsPagina2.includes(id))).toBe(false);
    expect(pagina1.total).toBe(pagina2.total);
  });
});

describe("fetchLeadsApi — filtros combinables", () => {
  it("filtra por etapa", async () => {
    const respuesta = await fetchLeadsApi({ ...PAGINA_1, etapa: "VENTA" });
    expect(respuesta.datos.length).toBeGreaterThan(0);
    expect(respuesta.datos.every((l) => l.etapa === "VENTA")).toBe(true);
  });

  it("filtra por semáforo", async () => {
    const respuesta = await fetchLeadsApi({ ...PAGINA_1, semaforo: "ROJO" });
    expect(respuesta.datos.length).toBeGreaterThan(0);
    expect(respuesta.datos.every((l) => l.semaforo === "ROJO")).toBe(true);
  });

  it("filtra por red social", async () => {
    const respuesta = await fetchLeadsApi({ ...PAGINA_1, redSocial: "INSTAGRAM" });
    expect(respuesta.datos.length).toBeGreaterThan(0);
    expect(respuesta.datos.every((l) => l.redSocial === "INSTAGRAM")).toBe(true);
  });

  it("combina etapa + semáforo en la misma consulta (filtros combinables, docs/07 F3)", async () => {
    const respuesta = await fetchLeadsApi({ ...PAGINA_1, etapa: "CONTACTADO", semaforo: "ROJO" });
    expect(respuesta.datos.every((l) => l.etapa === "CONTACTADO" && l.semaforo === "ROJO")).toBe(
      true,
    );
  });

  it("filtra por estado de SLA calculado (no columna persistida)", async () => {
    const respuesta = await fetchLeadsApi({ ...PAGINA_1, estadoSla: "ATRASADO" });
    expect(respuesta.datos.length).toBeGreaterThan(0);
  });

  it("filtra por rango de fechas de ingreso", async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const respuesta = await fetchLeadsApi({ ...PAGINA_1, fechaDesde: hoy, fechaHasta: hoy });
    expect(respuesta.datos.every((l) => l.ingresadoEn.slice(0, 10) === hoy)).toBe(true);
  });
});

describe("fetchLeadsApi — búsqueda por nombre, teléfono o correo", () => {
  it("encuentra por coincidencia parcial de nombre, sin distinguir mayúsculas", async () => {
    const respuesta = await fetchLeadsApi({ ...PAGINA_1, busqueda: "roberto salazar" });
    expect(respuesta.datos.length).toBeGreaterThan(0);
    expect(
      respuesta.datos.every((l) => l.cliente.nombre.toLowerCase().includes("roberto salazar")),
    ).toBe(true);
  });

  it("encuentra por coincidencia parcial de teléfono", async () => {
    const respuesta = await fetchLeadsApi({ ...PAGINA_1, busqueda: "0991234567" });
    expect(respuesta.datos.length).toBeGreaterThan(0);
  });

  it("encuentra por coincidencia parcial de correo", async () => {
    const respuesta = await fetchLeadsApi({ ...PAGINA_1, busqueda: "roberto.salazar@" });
    expect(respuesta.datos.length).toBeGreaterThan(0);
  });

  it("devuelve una lista vacía cuando no hay coincidencias, sin lanzar error", async () => {
    const respuesta = await fetchLeadsApi({ ...PAGINA_1, busqueda: "xxxxxxxx-no-existe-nada" });
    expect(respuesta.datos).toHaveLength(0);
    expect(respuesta.total).toBe(0);
  });
});

describe("fetchLeadsApi — filtrado automático por rol (docs/06 M5)", () => {
  it("un asesor solo ve los leads donde es el asesor asignado", async () => {
    const respuesta = await fetchLeadsApi(PAGINA_1, { rol: "ASESOR", usuarioId: "asesor-1" });
    expect(respuesta.datos.length).toBeGreaterThan(0);
    expect(respuesta.datos.every((l) => l.asesor?.id === "asesor-1")).toBe(true);
  });

  it("un vendedor solo ve los leads donde es el vendedor asignado", async () => {
    const respuesta = await fetchLeadsApi(PAGINA_1, { rol: "VENDEDOR", usuarioId: "vendedor-1" });
    expect(respuesta.datos.length).toBeGreaterThan(0);
    expect(respuesta.datos.every((l) => l.vendedor?.id === "vendedor-1")).toBe(true);
  });

  it("administrador y supervisor ven la cartera completa", async () => {
    const sinRestriccion = await fetchLeadsApi(PAGINA_1);
    const comoAdmin = await fetchLeadsApi(PAGINA_1, {
      rol: "ADMINISTRADOR",
      usuarioId: "cualquiera",
    });
    expect(comoAdmin.total).toBe(sinRestriccion.total);
  });
});

/**
 * `getLeadsActivosDeUsuario` va **antes** de `assignLeadsMasivoApi` a
 * propósito: `LEADS_MOCK` es un fixture mutable compartido a nivel de
 * módulo (no se resetea entre `it`s), y la suite de `assignLeadsMasivoApi`
 * de más abajo reasigna leads reales a `asesor-1` -- si estas aserciones
 * corrieran después, quedarían contaminadas por esa mutación.
 */
describe("getLeadsActivosDeUsuario (F7, carga activa de leads)", () => {
  it("cuenta solo los leads donde el usuario es el responsable operativo vigente, sin etapas terminales", () => {
    // lead-05 (VENTA) y lead-06 (NO_VENTA) quedan fuera aunque tengan
    // asesor/vendedor asignado -- son etapas terminales, no cartera activa.
    expect(getLeadsActivosDeUsuario("asesor-1").map((l) => l.id).sort()).toEqual([
      "lead-01",
      "lead-03",
    ]);
  });

  it("un lead traspasado cuenta para el vendedor que lo recibió, no para el asesor original", () => {
    // lead-02: asesor-2 originó el lead, pero vendedor-1 es el responsable
    // vigente tras el traspaso (mismo criterio que F5 "leads por asesor").
    const deVendedor1 = getLeadsActivosDeUsuario("vendedor-1");
    expect(deVendedor1.map((l) => l.id)).toEqual(["lead-02"]);
    expect(getLeadsActivosDeUsuario("asesor-2").map((l) => l.id)).not.toContain("lead-02");
  });

  it("devuelve una lista vacía para un id sin ningún lead asignado (ej. un usuario real recién creado)", () => {
    expect(getLeadsActivosDeUsuario("un-id-que-no-existe-en-el-mock")).toEqual([]);
  });
});

describe("assignLeadsMasivoApi", () => {
  let idsDisponibles: string[];

  beforeEach(async () => {
    const respuesta = await fetchLeadsApi({ pagina: 1, porPagina: 2 });
    idsDisponibles = respuesta.datos.map((l) => l.id);
  });

  it("reasigna los leads indicados al responsable elegido (simulación local, sin backend real)", async () => {
    await assignLeadsMasivoApi(idsDisponibles, "asesor-1");
    const respuesta = await fetchLeadsApi({
      pagina: 1,
      porPagina: 50,
    });
    const actualizados = respuesta.datos.filter((l) => idsDisponibles.includes(l.id));
    expect(actualizados.every((l) => l.asesor?.id === "asesor-1")).toBe(true);
  });
});
