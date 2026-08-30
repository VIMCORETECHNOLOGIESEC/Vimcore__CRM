import type { RolUsuario } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { UsuarioAcceso } from "../src/services/leads.access.js";
import {
  resolveAlcanceBase,
  resolveFiltroSql,
  resolveResponsableIds,
  tieneAccesoTotal,
} from "../src/services/metricas.access.js";
import type { MetricasQuery } from "../src/schemas/metricas.schema.js";

function usuario(id: string, rol: RolUsuario, empresaId: string | null): UsuarioAcceso {
  return { id, rol, empresaId };
}

const EMPRESA_A = "empresa-a";
const EMPRESA_B = "empresa-b";

function queryBase(overrides: Partial<MetricasQuery> = {}): MetricasQuery {
  return { rango: "30d", ...overrides };
}

describe("services/metricas.access — resolveAlcanceBase empresa scoping (Bloque C, Fase 2/Stage 2, D6)", () => {
  it("un supervisor de holding (empresaId null) NO agrega restricción por empresa al where (D6, agregado multi-empresa)", () => {
    const holdingSupervisor = usuario("sup-1", "SUPERVISOR", null);
    const where = resolveAlcanceBase(holdingSupervisor, queryBase());

    expect(where.empresaId).toBeUndefined();
  });

  it("un administrador acotado a una empresa concreta SOLO ve esa empresa (D6, supervisor de empresa)", () => {
    const adminEmpresaA = usuario("admin-1", "ADMINISTRADOR", EMPRESA_A);
    const where = resolveAlcanceBase(adminEmpresaA, queryBase());

    expect(where.empresaId).toBe(EMPRESA_A);
  });

  it("un asesor (empresaId siempre concreto vía Membresia) queda acotado a su propia empresa, además del filtro por responsable", () => {
    const asesor = usuario("asesor-1", "ASESOR", EMPRESA_B);
    const where = resolveAlcanceBase(asesor, queryBase());

    expect(where.empresaId).toBe(EMPRESA_B);
    expect(where.OR).toEqual([{ asesorId: "asesor-1" }, { vendedorId: "asesor-1" }]);
  });

  it("triangulación: dos administradores de empresas distintas producen where.empresaId distintos (no hardcoded)", () => {
    const whereA = resolveAlcanceBase(usuario("a", "ADMINISTRADOR", EMPRESA_A), queryBase());
    const whereB = resolveAlcanceBase(usuario("b", "ADMINISTRADOR", EMPRESA_B), queryBase());

    expect(whereA.empresaId).toBe(EMPRESA_A);
    expect(whereB.empresaId).toBe(EMPRESA_B);
    expect(whereA.empresaId).not.toBe(whereB.empresaId);
  });
});

describe("services/metricas.access — resolveFiltroSql empresa scoping (proyección SQL cruda, D6)", () => {
  const ahora = new Date("2026-08-20T00:00:00Z");

  it("holding-wide (empresaId null) proyecta empresaId: null en el filtro SQL crudo", () => {
    const holdingSupervisor = usuario("sup-1", "SUPERVISOR", null);
    const filtro = resolveFiltroSql(holdingSupervisor, queryBase(), "ingresado_en", ahora, ahora);

    expect(filtro.empresaId).toBeNull();
  });

  it("empresa concreta proyecta ese mismo empresaId en el filtro SQL crudo", () => {
    const adminEmpresaA = usuario("admin-1", "ADMINISTRADOR", EMPRESA_A);
    const filtro = resolveFiltroSql(adminEmpresaA, queryBase(), "ingresado_en", ahora, ahora);

    expect(filtro.empresaId).toBe(EMPRESA_A);
  });
});

describe("services/metricas.access — D6 ya resuelto: supervisor de holding sin permiso de escritura", () => {
  it("tieneAccesoTotal es puramente informativo de LECTURA — metricas.routes.ts no expone ningún endpoint de escritura (módulo 100% GET, sin necesidad de un chequeo adicional)", () => {
    // Documenta la decisión D6: "supervisor de holding ve métricas de todo
    // el holding... sin permiso de escritura" se satisface por construcción
    // — no existe ninguna mutación en el módulo de métricas para que un
    // supervisor de holding (o de empresa) pudiera ejecutar. `tieneAccesoTotal`
    // solo amplía el ALCANCE DE LECTURA (resolveResponsableIds/resolveAlcanceBase),
    // nunca autoriza una escritura.
    const holdingSupervisor = usuario("sup-1", "SUPERVISOR", null);
    expect(tieneAccesoTotal(holdingSupervisor)).toBe(true);
    expect(resolveResponsableIds(holdingSupervisor, queryBase())).toBeNull();
  });
});
