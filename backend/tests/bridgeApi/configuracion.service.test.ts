import { afterAll, describe, expect, it } from "vitest";
import { hashClaveBridge } from "../../src/lib/clave-bridge.js";
import { prisma, runWithTenantContext } from "../../src/lib/prisma.js";
import { testAdminPrisma } from "../fixtures/admin-prisma.js";
import { EMPRESA_BOOTSTRAP_ID } from "../fixtures/empresa.js";
import { actualizarConexion, actualizarMapeo, probarConexion } from "../../src/services/bridgeApi/configuracion.service.js";
import type { AuthenticatedUser } from "../../src/types/authenticated-user.js";

/**
 * Fix (bug de seguridad: los sub-recursos de bridge -- acá, `api-externa` --
 * no filtraban por empresa): mismo criterio que `bridges.service.test.ts` --
 * `obtenerBridgeApiExterna` ahora exige el actor autenticado y aplica el
 * mismo criterio 404-no-403 que `bridge.service.ts::bridgeFueraDeAlcance`.
 * Este archivo prueba exclusivamente ese scope -- el resto del contrato de
 * `actualizarConexion`/`actualizarMapeo`/`probarConexion` (cifrado,
 * idempotencia, verificación contra la API externa) no tenía cobertura
 * previa y queda fuera de este batch (no es parte de los 4 items del fix).
 */
const actorHoldingWide: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-0000000000ee",
  nombre: "Actor Holding-Wide (fixture de test)",
  correo: "actor-holding-wide-bridgeapi@fixture.test",
  rol: "ADMINISTRADOR",
  sessionScope: "holding",
  empresaId: null,
};

const actorCompanyScoped: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-0000000000ff",
  nombre: "Actor Company-Scoped (fixture de test)",
  correo: "actor-company-scoped-bridgeapi@fixture.test",
  rol: "ADMINISTRADOR",
  sessionScope: "company",
  empresaId: EMPRESA_BOOTSTRAP_ID,
};

function conContexto<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ empresaId: EMPRESA_BOOTSTRAP_ID }, fn);
}

/**
 * Fix (post-corrección, corrida real contra `.env.dev`): mismo criterio que
 * `bridges.service.test.ts::sinRestriccion` -- un actor holding-wide que
 * cruza a una empresa DISTINTA de la de `conContexto` necesita también un
 * contexto RLS sin restricción (`empresaId: null`), o la fila sería
 * físicamente invisible para el cliente `prisma` normal sin importar el
 * `actor` que reciba el service.
 */
function sinRestriccion<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ empresaId: null }, fn);
}

let contador = 0;

async function crearBridgeApiExterna(empresaId: string = EMPRESA_BOOTSTRAP_ID): Promise<{ id: string }> {
  contador += 1;
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      redSocial: "API_EXTERNA",
      nombre: `Bridge API externa ${contador}`,
      claveApiHash: hashClaveBridge(`clave-api-externa-${contador}`),
      empresaId,
    },
  });
  return { id: bridge.id };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("bridgeApi/configuracion.service — scope por empresa (fix bug de seguridad)", () => {
  it("actualizarConexion: 404 bridge_no_encontrado cuando el bridge pertenece a otra empresa", () =>
    conContexto(async () => {
      const empresaAjena = await testAdminPrisma.empresa.create({
        data: { nombre: `Empresa ajena bridgeApi conexion ${crypto.randomUUID()}` },
      });
      const bridgeAjeno = await crearBridgeApiExterna(empresaAjena.id);

      await expect(
        actualizarConexion(actorCompanyScoped, bridgeAjeno.id, {
          url: "https://ejemplo.test/leads",
          credencialExterna: "credencial-cualquiera",
        }),
      ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
    }));

  it("actualizarMapeo: 404 bridge_no_encontrado cuando el bridge pertenece a otra empresa", () =>
    conContexto(async () => {
      const empresaAjena = await testAdminPrisma.empresa.create({
        data: { nombre: `Empresa ajena bridgeApi mapeo ${crypto.randomUUID()}` },
      });
      const bridgeAjeno = await crearBridgeApiExterna(empresaAjena.id);

      await expect(
        actualizarMapeo(actorCompanyScoped, bridgeAjeno.id, {
          mapeoCampos: { id: "idExternoLead" },
        }),
      ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
    }));

  it("probarConexion: 404 bridge_no_encontrado cuando el bridge pertenece a otra empresa", () =>
    conContexto(async () => {
      const empresaAjena = await testAdminPrisma.empresa.create({
        data: { nombre: `Empresa ajena bridgeApi probar ${crypto.randomUUID()}` },
      });
      const bridgeAjeno = await crearBridgeApiExterna(empresaAjena.id);

      await expect(probarConexion(actorCompanyScoped, bridgeAjeno.id)).rejects.toMatchObject({
        code: "bridge_no_encontrado",
        statusHttp: 404,
      });
    }));

  it("actualizarConexion: 200 (control positivo) cuando el bridge pertenece a la propia empresa del actor", () =>
    conContexto(async () => {
      const bridgePropio = await crearBridgeApiExterna();

      const resultado = await actualizarConexion(actorCompanyScoped, bridgePropio.id, {
        url: "https://ejemplo.test/leads",
        credencialExterna: "credencial-cualquiera",
      });

      expect(resultado.id).toBe(bridgePropio.id);
    }));

  it("actualizarConexion: un actor holding-wide sigue pudiendo configurar cualquier bridge (sin restricción, D2)", () =>
    sinRestriccion(async () => {
      const empresaAjena = await testAdminPrisma.empresa.create({
        data: { nombre: `Empresa ajena bridgeApi holding ${crypto.randomUUID()}` },
      });
      const bridgeAjeno = await crearBridgeApiExterna(empresaAjena.id);

      const resultado = await actualizarConexion(actorHoldingWide, bridgeAjeno.id, {
        url: "https://ejemplo.test/leads",
        credencialExterna: "credencial-cualquiera",
      });

      expect(resultado.id).toBe(bridgeAjeno.id);
    }));

  it("con un bridge inexistente lanza bridge_no_encontrado (404), sin importar el actor", () =>
    conContexto(async () => {
      await expect(
        probarConexion(actorCompanyScoped, "00000000-0000-0000-0000-000000000000"),
      ).rejects.toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
    }));
});
