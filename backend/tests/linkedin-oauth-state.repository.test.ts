import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import * as oauthStateRepository from "../src/repositories/linkedin/linkedin-oauth-state.repository.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

async function crearContextoOAuth(empresaId = EMPRESA_BOOTSTRAP_ID) {
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre: "Administrador OAuth LinkedIn",
      correo: `linkedin-oauth-${randomUUID()}@test.local`,
      passwordHash: "hash-no-usado",
      rol: "ADMINISTRADOR",
    },
  });
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      empresaId,
      redSocial: "LINKEDIN",
      nombre: `LinkedIn OAuth ${randomUUID()}`,
      claveApiHash: `linkedin-oauth-${randomUUID()}`,
    },
  });
  return { bridgeId: bridge.id, usuarioId: usuario.id };
}

function enTenant<T>(fn: () => Promise<T>, empresaId = EMPRESA_BOOTSTRAP_ID): Promise<T> {
  return runWithTenantContext({ empresaId }, fn);
}

afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

describe("repositories/linkedin/oauth-state — persistencia y consumo atómico", () => {
  it("createState persiste únicamente el hash y el contexto OAuth", async () => {
    const contexto = await crearContextoOAuth();
    const stateHash = `sha256:${randomUUID()}`;
    const expiraEn = new Date(Date.now() + 5 * 60_000);

    const creado = await enTenant(() =>
      oauthStateRepository.createState({ ...contexto, stateHash, expiraEn }),
    );

    expect(creado).toMatchObject({ ...contexto, stateHash, expiraEn, usadoEn: null });
    expect(Object.hasOwn(creado, "state")).toBe(false);
  });

  it("consumeValidState permite exactamente un ganador entre intentos concurrentes", async () => {
    const contexto = await crearContextoOAuth();
    const stateHash = `sha256:${randomUUID()}`;
    await enTenant(() =>
      oauthStateRepository.createState({
        ...contexto,
        stateHash,
        expiraEn: new Date(Date.now() + 60_000),
      }),
    );

    const resultados = await enTenant(() =>
      Promise.all([
        oauthStateRepository.consumeValidState(stateHash),
        oauthStateRepository.consumeValidState(stateHash),
      ]),
    );

    const consumidos = resultados.filter((resultado) => resultado !== null);
    expect(consumidos).toHaveLength(1);
    expect(consumidos[0]).toMatchObject({ ...contexto, stateHash });
    expect(consumidos[0]?.usadoEn).toBeInstanceOf(Date);
    expect(resultados.filter((resultado) => resultado === null)).toHaveLength(1);
  });

  it("rechaza states expirados, usados o con hash distinto sin marcarlos nuevamente", async () => {
    const contexto = await crearContextoOAuth();
    const hashExpirado = `sha256:${randomUUID()}`;
    const hashUsado = `sha256:${randomUUID()}`;
    await enTenant(async () => {
      await oauthStateRepository.createState({
        ...contexto,
        stateHash: hashExpirado,
        expiraEn: new Date(Date.now() - 60_000),
      });
      await oauthStateRepository.createState({
        ...contexto,
        stateHash: hashUsado,
        expiraEn: new Date(Date.now() + 60_000),
      });
    });
    const usadoEnOriginal = new Date(Date.now() - 30_000);
    await testAdminPrisma.linkedInOAuthState.update({
      where: { stateHash: hashUsado },
      data: { usadoEn: usadoEnOriginal },
    });

    const [expirado, usado, inexistente] = await enTenant(() =>
      Promise.all([
        oauthStateRepository.consumeValidState(hashExpirado),
        oauthStateRepository.consumeValidState(hashUsado),
        oauthStateRepository.consumeValidState(`sha256:${randomUUID()}`),
      ]),
    );

    expect(expirado).toBeNull();
    expect(usado).toBeNull();
    expect(inexistente).toBeNull();
    const filas = await testAdminPrisma.linkedInOAuthState.findMany({
      where: { stateHash: { in: [hashExpirado, hashUsado] } },
      orderBy: { stateHash: "asc" },
    });
    expect(filas.find((fila) => fila.stateHash === hashExpirado)?.usadoEn).toBeNull();
    expect(filas.find((fila) => fila.stateHash === hashUsado)?.usadoEn).toEqual(usadoEnOriginal);
  });

  it("deleteExpiredStates elimina solo states vencidos dentro del tenant activo", async () => {
    const empresaAislada = await testAdminPrisma.empresa.create({
      data: { nombre: `Empresa OAuth cleanup ${randomUUID()}` },
    });
    const contexto = await crearContextoOAuth(empresaAislada.id);
    const hashExpirado = `sha256:${randomUUID()}`;
    const hashVigente = `sha256:${randomUUID()}`;
    const ahora = new Date();
    await enTenant(async () => {
      await oauthStateRepository.createState({
        ...contexto,
        stateHash: hashExpirado,
        expiraEn: new Date(ahora.getTime() - 1),
      });
      await oauthStateRepository.createState({
        ...contexto,
        stateHash: hashVigente,
        expiraEn: new Date(ahora.getTime() + 60_000),
      });
    }, empresaAislada.id);

    const eliminados = await enTenant(
      () => oauthStateRepository.deleteExpiredStates(ahora),
      empresaAislada.id,
    );

    expect(eliminados).toBe(1);
    const restantes = await testAdminPrisma.linkedInOAuthState.findMany({
      where: { stateHash: { in: [hashExpirado, hashVigente] } },
    });
    expect(restantes.map((fila) => fila.stateHash)).toEqual([hashVigente]);
  });
});
