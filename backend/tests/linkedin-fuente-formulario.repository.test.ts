import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { AppError } from "../src/lib/app-error.js";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import * as formularioRepository from "../src/repositories/linkedin/linkedin-formulario.repository.js";
import * as fuenteRepository from "../src/repositories/linkedin/linkedin-fuente.repository.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

async function crearContextoFuente(empresaId = EMPRESA_BOOTSTRAP_ID) {
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre: "Administrador Fuente LinkedIn",
      correo: `linkedin-fuente-${randomUUID()}@test.local`,
      passwordHash: "hash-no-usado",
      rol: "ADMINISTRADOR",
    },
  });
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      empresaId,
      redSocial: "LINKEDIN",
      nombre: `LinkedIn Fuente ${randomUUID()}`,
      claveApiHash: `linkedin-fuente-${randomUUID()}`,
    },
  });
  const conexion = await testAdminPrisma.linkedInConexion.create({
    data: {
      bridgeId: bridge.id,
      autorizadoPorUsuarioId: usuario.id,
      accessTokenCifrado: `ciphertext-access-${randomUUID()}`,
      refreshTokenCifrado: `ciphertext-refresh-${randomUUID()}`,
      accessTokenExpiraEn: new Date(Date.now() + 60 * 60_000),
      refreshTokenExpiraEn: new Date(Date.now() + 24 * 60 * 60_000),
      scopes: ["r_marketing_leadgen_automation"],
    },
  });
  return { bridge, conexion };
}

function enTenant<T>(fn: () => Promise<T>, empresaId = EMPRESA_BOOTSTRAP_ID): Promise<T> {
  return runWithTenantContext({ empresaId }, fn);
}

function fuenteDescubierta(
  conexionId: string,
  overrides: Partial<fuenteRepository.UpsertDiscoveredSourceData> = {},
): fuenteRepository.UpsertDiscoveredSourceData {
  return {
    conexionId,
    tipo: "ORGANIZATION",
    ownerUrn: `urn:li:organization:${randomUUID()}`,
    nombre: "Organización descubierta",
    tipoLead: "COMPANY",
    ...overrides,
  };
}

afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

describe("repositories/linkedin/fuente", () => {
  it("lista múltiples fuentes activas del mismo bridge sin exponer credenciales", async () => {
    const { bridge, conexion } = await crearContextoFuente();
    const otroBridge = await crearContextoFuente();
    const primera = await enTenant(() =>
      fuenteRepository.upsertDiscoveredSource(
        fuenteDescubierta(conexion.id, { nombre: "Primera", tipoLead: "COMPANY" }),
      ),
    );
    const segunda = await enTenant(() =>
      fuenteRepository.upsertDiscoveredSource(
        fuenteDescubierta(conexion.id, { nombre: "Segunda", tipoLead: "EVENT" }),
      ),
    );
    await enTenant(() => fuenteRepository.setActive(primera.id, true));
    await enTenant(() => fuenteRepository.setActive(segunda.id, true));

    const fuentes = await enTenant(() => fuenteRepository.listByBridge(bridge.id));
    const fuenteCorrecta = await enTenant(() =>
      fuenteRepository.findByIdForBridge(primera.id, bridge.id),
    );
    const fuenteDeOtroBridge = await enTenant(() =>
      fuenteRepository.findByIdForBridge(primera.id, otroBridge.bridge.id),
    );

    expect(fuentes.map((fuente) => fuente.id).sort()).toEqual([primera.id, segunda.id].sort());
    expect(fuenteCorrecta?.id).toBe(primera.id);
    expect(fuenteDeOtroBridge).toBeNull();
    expect(JSON.stringify(fuentes)).not.toMatch(/ciphertext|tokenCifrado|accessToken|refreshToken/i);
  });

  it("preserva activación, suscripción y cursor cuando redescubre una fuente", async () => {
    const { conexion } = await crearContextoFuente();
    const datos = fuenteDescubierta(conexion.id);
    const creada = await enTenant(() => fuenteRepository.upsertDiscoveredSource(datos));
    const cursor = new Date("2026-08-28T12:00:00.000Z");
    await enTenant(() => fuenteRepository.setActive(creada.id, true));
    await enTenant(() =>
      fuenteRepository.markSubscription(creada.id, {
        estadoSuscripcion: "ACTIVA",
        subscriptionId: "suscripcion-vigente",
      }),
    );
    await enTenant(() => fuenteRepository.advanceReconciliationCursor(creada.id, cursor));

    const redescubierta = await enTenant(() =>
      fuenteRepository.upsertDiscoveredSource({ ...datos, nombre: "Nombre actualizado" }),
    );

    expect(redescubierta).toMatchObject({
      id: creada.id,
      nombre: "Nombre actualizado",
      activa: true,
      estadoSuscripcion: "ACTIVA",
      ultimaSincronizacionEn: cursor,
    });
    const persistida = await testAdminPrisma.linkedInFuente.findUnique({
      where: { id: creada.id },
    });
    expect(persistida).not.toBeNull();
    expect(persistida?.subscriptionId).toBe("suscripcion-vigente");
  });

  it("rechaza como ambigua la misma fuente activa conectada a dos bridges", async () => {
    const ownerUrn = `urn:li:organization:${randomUUID()}`;
    const contextoA = await crearContextoFuente();
    const contextoB = await crearContextoFuente();
    const fuenteA = await enTenant(() =>
      fuenteRepository.upsertDiscoveredSource(
        fuenteDescubierta(contextoA.conexion.id, { ownerUrn, tipoLead: "COMPANY" }),
      ),
    );
    const fuenteB = await enTenant(() =>
      fuenteRepository.upsertDiscoveredSource(
        fuenteDescubierta(contextoB.conexion.id, { ownerUrn, tipoLead: "COMPANY" }),
      ),
    );
    await enTenant(() => fuenteRepository.setActive(fuenteA.id, true));
    await enTenant(() => fuenteRepository.setActive(fuenteB.id, true));

    const error = await enTenant(() =>
      fuenteRepository.findActiveByOwner(ownerUrn, "COMPANY"),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: "linkedin_fuente_ambigua",
      statusHttp: 409,
    });
    expect((error as Error).message).not.toContain(ownerUrn);
  });

  it("oculta fuentes de otra empresa y valida pertenencia al bridge en una consulta", async () => {
    const empresaAjena = await testAdminPrisma.empresa.create({
      data: { nombre: `Empresa LinkedIn ${randomUUID()}` },
    });
    const propio = await crearContextoFuente();
    const ajeno = await crearContextoFuente(empresaAjena.id);
    const fuenteAjena = await enTenant(
      () => fuenteRepository.upsertDiscoveredSource(fuenteDescubierta(ajeno.conexion.id)),
      empresaAjena.id,
    );
    await enTenant(() => fuenteRepository.setActive(fuenteAjena.id, true), empresaAjena.id);

    const listado = await enTenant(() => fuenteRepository.listByBridge(ajeno.bridge.id));
    const porIdAjeno = await enTenant(() =>
      fuenteRepository.findByIdForBridge(fuenteAjena.id, ajeno.bridge.id),
    );
    const bridgeIncorrecto = await enTenant(() =>
      fuenteRepository.findByIdForBridge(fuenteAjena.id, propio.bridge.id),
    );
    const porOwner = await enTenant(() =>
      fuenteRepository.findActiveByOwner(fuenteAjena.ownerUrn, fuenteAjena.tipoLead),
    );

    expect(listado).toEqual([]);
    expect(porIdAjeno).toBeNull();
    expect(bridgeIncorrecto).toBeNull();
    expect(porOwner).toBeNull();
  });

  it("no retrocede el cursor de reconciliación y devuelve contexto sin tokens", async () => {
    const empresa = await testAdminPrisma.empresa.create({
      data: { nombre: `Empresa Reconciliación ${randomUUID()}` },
    });
    const { bridge, conexion } = await crearContextoFuente(empresa.id);
    const fuente = await enTenant(
      () => fuenteRepository.upsertDiscoveredSource(fuenteDescubierta(conexion.id)),
      empresa.id,
    );
    await enTenant(() => fuenteRepository.setActive(fuente.id, true), empresa.id);
    const reciente = new Date("2026-08-28T15:00:00.000Z");
    const anterior = new Date("2026-08-28T14:00:00.000Z");

    expect(
      await enTenant(
        () => fuenteRepository.advanceReconciliationCursor(fuente.id, reciente),
        empresa.id,
      ),
    ).toBe(true);
    expect(
      await enTenant(
        () => fuenteRepository.advanceReconciliationCursor(fuente.id, anterior),
        empresa.id,
      ),
    ).toBe(false);
    const candidatas = await enTenant(
      () => fuenteRepository.listActiveForReconciliation(1),
      empresa.id,
    );

    expect(candidatas).toHaveLength(1);
    expect(candidatas[0]).toMatchObject({
      id: fuente.id,
      bridgeId: bridge.id,
      conexionId: conexion.id,
      ultimaSincronizacionEn: reciente,
    });
    expect(JSON.stringify(candidatas)).not.toMatch(/ciphertext|tokenCifrado|accessToken|refreshToken/i);
  });
});

describe("repositories/linkedin/formulario", () => {
  it("actualiza y reactiva por fuente+versionedFormUrn sin colisionar entre fuentes", async () => {
    const { bridge, conexion } = await crearContextoFuente();
    const fuenteA = await enTenant(() =>
      fuenteRepository.upsertDiscoveredSource(fuenteDescubierta(conexion.id)),
    );
    const fuenteB = await enTenant(() =>
      fuenteRepository.upsertDiscoveredSource(fuenteDescubierta(conexion.id)),
    );
    const versionedFormUrn = `urn:li:versionedLeadGenForm:${randomUUID()}`;
    const inicial = await enTenant(() =>
      formularioRepository.upsertForm({
        fuenteId: fuenteA.id,
        versionedFormUrn,
        nombre: "Formulario inicial",
        contenido: { questions: [{ questionId: 1 }] },
        sincronizadoEn: new Date("2026-08-28T10:00:00.000Z"),
      }),
    );
    await testAdminPrisma.linkedInFormulario.update({
      where: { id: inicial.id },
      data: { activo: false },
    });

    const actualizado = await enTenant(() =>
      formularioRepository.upsertForm({
        fuenteId: fuenteA.id,
        versionedFormUrn,
        nombre: "Formulario actualizado",
        contenido: { questions: [{ questionId: 2 }] },
        sincronizadoEn: new Date("2026-08-28T11:00:00.000Z"),
      }),
    );
    const otraFuente = await enTenant(() =>
      formularioRepository.upsertForm({
        fuenteId: fuenteB.id,
        versionedFormUrn,
        nombre: "Misma versión, otra fuente",
        contenido: { questions: [] },
        sincronizadoEn: new Date("2026-08-28T11:00:00.000Z"),
      }),
    );
    const encontrada = await enTenant(() =>
      formularioRepository.findByVersionedFormUrn({
        bridgeId: bridge.id,
        fuenteId: fuenteA.id,
        versionedFormUrn,
      }),
    );

    expect(actualizado).toMatchObject({
      id: inicial.id,
      nombre: "Formulario actualizado",
      activo: true,
      contenido: { questions: [{ questionId: 2 }] },
    });
    expect(otraFuente.id).not.toBe(inicial.id);
    expect(encontrada?.versionedFormUrn).toBe(versionedFormUrn);
  });

  it("inactiva solo formularios faltantes de la fuente indicada y conserva históricos", async () => {
    const { conexion } = await crearContextoFuente();
    const fuenteA = await enTenant(() =>
      fuenteRepository.upsertDiscoveredSource(fuenteDescubierta(conexion.id)),
    );
    const fuenteB = await enTenant(() =>
      fuenteRepository.upsertDiscoveredSource(fuenteDescubierta(conexion.id)),
    );
    const urnConservada = `urn:li:versionedLeadGenForm:${randomUUID()}`;
    const urnFaltante = `urn:li:versionedLeadGenForm:${randomUUID()}`;
    const urnOtraFuente = `urn:li:versionedLeadGenForm:${randomUUID()}`;
    for (const [fuenteId, versionedFormUrn] of [
      [fuenteA.id, urnConservada],
      [fuenteA.id, urnFaltante],
      [fuenteB.id, urnOtraFuente],
    ] as const) {
      await enTenant(() =>
        formularioRepository.upsertForm({
          fuenteId,
          versionedFormUrn,
          nombre: null,
          contenido: {},
          sincronizadoEn: new Date(),
        }),
      );
    }

    const cantidad = await enTenant(() =>
      formularioRepository.markInactiveMissingForms(fuenteA.id, [urnConservada]),
    );
    const formularios = await testAdminPrisma.linkedInFormulario.findMany({
      where: { fuenteId: { in: [fuenteA.id, fuenteB.id] } },
    });

    expect(cantidad).toBe(1);
    expect(formularios.find((formulario) => formulario.versionedFormUrn === urnConservada)?.activo).toBe(true);
    expect(formularios.find((formulario) => formulario.versionedFormUrn === urnFaltante)?.activo).toBe(false);
    expect(formularios.find((formulario) => formulario.versionedFormUrn === urnOtraFuente)?.activo).toBe(true);
  });
});
