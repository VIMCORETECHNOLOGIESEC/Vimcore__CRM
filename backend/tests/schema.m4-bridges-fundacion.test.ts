import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

/**
 * D-M4-fundacion (diseño m4-bridges-crud-fundacion, tarea PR1.3/1.4):
 * verificación de la migración `20260818120000_m4_campanias_cuentas` contra
 * la base de pruebas real (ya migrada por `prisma migrate deploy` antes de
 * `pnpm test`), mismo patrón que `schema.bridges.test.ts` (M4 parcial) y
 * `schema.m5-gestion-leads.test.ts`.
 */

let contador = 0;

async function crearBridge(): Promise<{ id: string }> {
  contador += 1;
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      redSocial: "FACEBOOK",
      nombre: `Bridge fundacion ${contador}`,
      claveApiHash: hashClaveBridge(`clave-fundacion-${contador}-${randomUUID()}`),
      estado: "ACTIVO",
      empresaId: EMPRESA_BOOTSTRAP_ID,
    },
  });
  return { id: bridge.id };
}

async function crearCuentaPublicitaria(
  bridgeId: string,
  overrides: { idExterno?: string; idExternoVinculado?: string | null } = {},
): Promise<{ id: string; idExterno: string }> {
  contador += 1;
  const idExterno = overrides.idExterno ?? `page-${contador}-${randomUUID()}`;
  const cuenta = await prisma.cuentaPublicitaria.create({
    data: {
      bridgeId,
      idExterno,
      nombre: `Página de prueba ${contador}`,
      idExternoVinculado: overrides.idExternoVinculado ?? null,
    },
  });
  return { id: cuenta.id, idExterno };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("schema M4-fundacion — CuentaPublicitaria (migración, round-trip real)", () => {
  it("persiste una Página con su Instagram vinculado en la misma fila", async () => {
    const bridge = await crearBridge();

    const cuenta = await prisma.cuentaPublicitaria.create({
      data: {
        bridgeId: bridge.id,
        idExterno: `page-vinculada-${randomUUID()}`,
        nombre: "Página con Instagram vinculado",
        idExternoVinculado: `ig-vinculada-${randomUUID()}`,
      },
    });

    expect(cuenta.idExterno).toContain("page-vinculada-");
    expect(cuenta.idExternoVinculado).toContain("ig-vinculada-");
  });

  it("idExternoVinculado es nullable: una Página sin Instagram vinculado queda NULL", async () => {
    const bridge = await crearBridge();

    const cuenta = await crearCuentaPublicitaria(bridge.id);

    expect(cuenta).toBeDefined();
    const encontrada = await prisma.cuentaPublicitaria.findUniqueOrThrow({ where: { id: cuenta.id } });
    expect(encontrada.idExternoVinculado).toBeNull();
  });

  it("UNIQUE(bridge_id, id_externo): rechaza una Página duplicada bajo el mismo bridge", async () => {
    const bridge = await crearBridge();
    const { idExterno } = await crearCuentaPublicitaria(bridge.id);

    await expect(
      prisma.cuentaPublicitaria.create({
        data: { bridgeId: bridge.id, idExterno, nombre: "Duplicada" },
      }),
    ).rejects.toThrow();
  });

  it("la misma Página (id_externo) bajo dos bridges distintos SÍ se permite", async () => {
    const bridgeA = await crearBridge();
    const bridgeB = await crearBridge();
    const idExternoCompartido = `page-compartida-${randomUUID()}`;

    await crearCuentaPublicitaria(bridgeA.id, { idExterno: idExternoCompartido });
    const segunda = await crearCuentaPublicitaria(bridgeB.id, { idExterno: idExternoCompartido });

    expect(segunda.idExterno).toBe(idExternoCompartido);
  });

  it("onDelete Cascade: eliminar el Bridge elimina sus CuentaPublicitaria", async () => {
    const bridge = await crearBridge();
    const cuenta = await crearCuentaPublicitaria(bridge.id);

    await testAdminPrisma.bridge.delete({ where: { id: bridge.id } });

    const encontrada = await prisma.cuentaPublicitaria.findUnique({ where: { id: cuenta.id } });
    expect(encontrada).toBeNull();
  });
});

describe("schema M4-fundacion — Campania (migración, round-trip real)", () => {
  it("persiste una campaña ligada a su cuenta publicitaria y red social", async () => {
    const bridge = await crearBridge();
    const cuenta = await crearCuentaPublicitaria(bridge.id);

    const campania = await prisma.campania.create({
      data: {
        cuentaPublicitariaId: cuenta.id,
        idExterno: `camp-${randomUUID()}`,
        nombre: "Campaña de prueba",
        redSocial: "FACEBOOK",
      },
    });

    expect(campania.cuentaPublicitariaId).toBe(cuenta.id);
    expect(campania.redSocial).toBe("FACEBOOK");
    expect(campania.activa).toBe(true);
  });

  it("UNIQUE(cuenta_publicitaria_id, id_externo): rechaza id externo duplicado bajo la misma cuenta", async () => {
    const bridge = await crearBridge();
    const cuenta = await crearCuentaPublicitaria(bridge.id);
    const idExterno = `camp-dup-${randomUUID()}`;

    await prisma.campania.create({
      data: { cuentaPublicitariaId: cuenta.id, idExterno, nombre: "Original", redSocial: "FACEBOOK" },
    });

    await expect(
      prisma.campania.create({
        data: { cuentaPublicitariaId: cuenta.id, idExterno, nombre: "Duplicada", redSocial: "FACEBOOK" },
      }),
    ).rejects.toThrow();
  });

  it("el mismo id externo bajo dos cuentas publicitarias distintas SÍ se permite", async () => {
    const bridge = await crearBridge();
    const cuentaA = await crearCuentaPublicitaria(bridge.id);
    const cuentaB = await crearCuentaPublicitaria(bridge.id);
    const idExternoCompartido = `camp-compartida-${randomUUID()}`;

    await prisma.campania.create({
      data: { cuentaPublicitariaId: cuentaA.id, idExterno: idExternoCompartido, nombre: "A", redSocial: "FACEBOOK" },
    });
    const campaniaB = await prisma.campania.create({
      data: { cuentaPublicitariaId: cuentaB.id, idExterno: idExternoCompartido, nombre: "B", redSocial: "FACEBOOK" },
    });

    expect(campaniaB.idExterno).toBe(idExternoCompartido);
  });

  it("onDelete Cascade: eliminar la CuentaPublicitaria elimina sus Campania", async () => {
    const bridge = await crearBridge();
    const cuenta = await crearCuentaPublicitaria(bridge.id);
    const campania = await prisma.campania.create({
      data: {
        cuentaPublicitariaId: cuenta.id,
        idExterno: `camp-cascade-${randomUUID()}`,
        nombre: "Campaña a cascadear",
        redSocial: "FACEBOOK",
      },
    });

    await prisma.cuentaPublicitaria.delete({ where: { id: cuenta.id } });

    const encontrada = await prisma.campania.findUnique({ where: { id: campania.id } });
    expect(encontrada).toBeNull();
  });
});
