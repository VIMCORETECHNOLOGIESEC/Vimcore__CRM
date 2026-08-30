import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import * as conexionRepository from "../src/repositories/linkedin/linkedin-conexion.repository.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

async function crearContextoConexion(empresaId = EMPRESA_BOOTSTRAP_ID) {
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre: "Administrador Conexión LinkedIn",
      correo: `linkedin-conexion-${randomUUID()}@test.local`,
      passwordHash: "hash-no-usado",
      rol: "ADMINISTRADOR",
    },
  });
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      empresaId,
      redSocial: "LINKEDIN",
      nombre: `LinkedIn Conexión ${randomUUID()}`,
      claveApiHash: `linkedin-conexion-${randomUUID()}`,
    },
  });
  return { bridgeId: bridge.id, autorizadoPorUsuarioId: usuario.id };
}

function enTenant<T>(fn: () => Promise<T>, empresaId = EMPRESA_BOOTSTRAP_ID): Promise<T> {
  return runWithTenantContext({ empresaId }, fn);
}

function datosAutorizacion(
  contexto: Awaited<ReturnType<typeof crearContextoConexion>>,
  overrides: Partial<conexionRepository.UpsertFromAuthorizationData> = {},
): conexionRepository.UpsertFromAuthorizationData {
  return {
    ...contexto,
    memberUrn: "urn:li:person:miembro-inicial",
    accessTokenCifrado: `access-cifrado-${randomUUID()}`,
    refreshTokenCifrado: `refresh-cifrado-${randomUUID()}`,
    accessTokenExpiraEn: new Date(Date.now() + 60 * 60_000),
    refreshTokenExpiraEn: new Date(Date.now() + 30 * 24 * 60 * 60_000),
    scopes: ["r_marketing_leadgen_automation"],
    ...overrides,
  };
}

afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

describe("repositories/linkedin/conexion — proyecciones y autorización", () => {
  it("findByBridgeId nunca devuelve ciphertext y expone solo si existe refresh token", async () => {
    const contexto = await crearContextoConexion();
    const data = datosAutorizacion(contexto);
    await enTenant(() => conexionRepository.upsertFromAuthorization(data));

    const segura = await enTenant(() => conexionRepository.findByBridgeId(contexto.bridgeId));

    expect(segura).toMatchObject({
      bridgeId: contexto.bridgeId,
      estado: "ACTIVA",
      tieneRefreshToken: true,
    });
    expect(Object.hasOwn(segura!, "accessTokenCifrado")).toBe(false);
    expect(Object.hasOwn(segura!, "refreshTokenCifrado")).toBe(false);

    const interna = await enTenant(() =>
      conexionRepository.findWithEncryptedTokens(contexto.bridgeId),
    );
    expect(interna?.accessTokenCifrado).toBe(data.accessTokenCifrado);
    expect(interna?.refreshTokenCifrado).toBe(data.refreshTokenCifrado);
  });

  it("upsertFromAuthorization actualiza la única conexión del bridge y reactiva una revocada", async () => {
    const contexto = await crearContextoConexion();
    const inicial = await enTenant(() =>
      conexionRepository.upsertFromAuthorization(datosAutorizacion(contexto)),
    );
    await enTenant(() => conexionRepository.revoke(inicial.id));
    const nuevosDatos = datosAutorizacion(contexto, {
      memberUrn: "urn:li:person:miembro-nuevo",
      accessTokenCifrado: "access-cifrado-nuevo",
      refreshTokenCifrado: null,
      refreshTokenExpiraEn: null,
      scopes: ["r_marketing_leadgen_automation", "r_events"],
    });

    const reautorizada = await enTenant(() =>
      conexionRepository.upsertFromAuthorization(nuevosDatos),
    );

    expect(reautorizada).toMatchObject({
      id: inicial.id,
      bridgeId: contexto.bridgeId,
      memberUrn: "urn:li:person:miembro-nuevo",
      estado: "ACTIVA",
      revocadoEn: null,
      refreshTokenExpiraEn: null,
      scopes: ["r_marketing_leadgen_automation", "r_events"],
    });
    const interna = await enTenant(() =>
      conexionRepository.findWithEncryptedTokens(contexto.bridgeId),
    );
    expect(interna?.accessTokenCifrado).toBe("access-cifrado-nuevo");
    expect(interna?.refreshTokenCifrado).toBeNull();
  });
});

describe("repositories/linkedin/conexion — ciclo de tokens", () => {
  it("rotateTokens preserva refresh token y vencimiento cuando LinkedIn no devuelve uno nuevo", async () => {
    const contexto = await crearContextoConexion();
    const refreshTokenExpiraEn = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    const creada = await enTenant(() =>
      conexionRepository.upsertFromAuthorization(
        datosAutorizacion(contexto, {
          refreshTokenCifrado: "refresh-cifrado-vigente",
          refreshTokenExpiraEn,
        }),
      ),
    );
    const nuevaExpiracionAccess = new Date(Date.now() + 2 * 60 * 60_000);

    await enTenant(() =>
      conexionRepository.rotateTokens(creada.id, {
        accessTokenCifrado: "access-cifrado-rotado",
        accessTokenExpiraEn: nuevaExpiracionAccess,
      }),
    );

    const interna = await enTenant(() =>
      conexionRepository.findWithEncryptedTokens(contexto.bridgeId),
    );
    expect(interna).toMatchObject({
      accessTokenCifrado: "access-cifrado-rotado",
      accessTokenExpiraEn: nuevaExpiracionAccess,
      refreshTokenCifrado: "refresh-cifrado-vigente",
      refreshTokenExpiraEn,
    });
  });

  it("rotateTokens sustituye refresh token y vencimiento solo cuando llega uno nuevo", async () => {
    const contexto = await crearContextoConexion();
    const creada = await enTenant(() =>
      conexionRepository.upsertFromAuthorization(datosAutorizacion(contexto)),
    );
    const nuevaExpiracionRefresh = new Date(Date.now() + 60 * 24 * 60 * 60_000);

    await enTenant(() =>
      conexionRepository.rotateTokens(creada.id, {
        accessTokenCifrado: "access-cifrado-rotado-2",
        accessTokenExpiraEn: new Date(Date.now() + 2 * 60 * 60_000),
        refreshTokenCifrado: "refresh-cifrado-rotado",
        refreshTokenExpiraEn: nuevaExpiracionRefresh,
      }),
    );

    const interna = await enTenant(() =>
      conexionRepository.findWithEncryptedTokens(contexto.bridgeId),
    );
    expect(interna?.refreshTokenCifrado).toBe("refresh-cifrado-rotado");
    expect(interna?.refreshTokenExpiraEn).toEqual(nuevaExpiracionRefresh);
  });

  it("markTokenExpired conserva la conexión recuperable y revoke invalida también sus fuentes", async () => {
    const contexto = await crearContextoConexion();
    const creada = await enTenant(() =>
      conexionRepository.upsertFromAuthorization(datosAutorizacion(contexto)),
    );
    const fuente = await testAdminPrisma.linkedInFuente.create({
      data: {
        conexionId: creada.id,
        tipo: "ORGANIZATION",
        ownerUrn: `urn:li:organization:${randomUUID()}`,
        nombre: "Fuente a revocar",
        tipoLead: "COMPANY",
        activa: true,
        estadoSuscripcion: "ACTIVA",
      },
    });

    const expirada = await enTenant(() => conexionRepository.markTokenExpired(creada.id));
    expect(expirada).toMatchObject({ estado: "TOKEN_EXPIRADO", revocadoEn: null });

    const revocada = await enTenant(() => conexionRepository.revoke(creada.id));
    expect(revocada.estado).toBe("REVOCADA");
    expect(revocada.revocadoEn).toBeInstanceOf(Date);
    const fuenteRevocada = await testAdminPrisma.linkedInFuente.findUnique({ where: { id: fuente.id } });
    expect(fuenteRevocada).toMatchObject({ activa: false, estadoSuscripcion: "REVOCADA" });
  });
});

describe("repositories/linkedin/conexion — selección para refresh", () => {
  it("listDueForRefresh devuelve solo ACTIVA próximas a vencer, con tokens, y respeta RLS", async () => {
    const limite = new Date(Date.now() + 30 * 60_000);
    const contextoVencimiento = await crearContextoConexion();
    const contextoFuturo = await crearContextoConexion();
    const contextoExpirado = await crearContextoConexion();
    const otraEmpresa = await testAdminPrisma.empresa.create({
      data: { nombre: `Empresa LinkedIn ${randomUUID()}` },
    });
    const contextoAjeno = await crearContextoConexion(otraEmpresa.id);

    const porVencer = await enTenant(() =>
      conexionRepository.upsertFromAuthorization(
        datosAutorizacion(contextoVencimiento, {
          accessTokenCifrado: "access-due",
          accessTokenExpiraEn: new Date(limite.getTime() - 1),
        }),
      ),
    );
    await enTenant(() =>
      conexionRepository.upsertFromAuthorization(
        datosAutorizacion(contextoFuturo, {
          accessTokenExpiraEn: new Date(limite.getTime() + 60_000),
        }),
      ),
    );
    const tokenExpirado = await enTenant(() =>
      conexionRepository.upsertFromAuthorization(
        datosAutorizacion(contextoExpirado, {
          accessTokenExpiraEn: new Date(limite.getTime() - 1),
        }),
      ),
    );
    await enTenant(() => conexionRepository.markTokenExpired(tokenExpirado.id));
    await enTenant(
      () =>
        conexionRepository.upsertFromAuthorization(
          datosAutorizacion(contextoAjeno, {
            accessTokenExpiraEn: new Date(limite.getTime() - 1),
          }),
        ),
      otraEmpresa.id,
    );

    const seleccionadas = await enTenant(() => conexionRepository.listDueForRefresh(limite));

    expect(seleccionadas.map((conexion) => conexion.id)).toEqual([porVencer.id]);
    expect(seleccionadas[0]?.accessTokenCifrado).toBe("access-due");
    expect(Object.hasOwn(seleccionadas[0]!, "refreshTokenCifrado")).toBe(true);
  });
});
