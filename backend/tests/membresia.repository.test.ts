import { randomUUID } from "node:crypto";
import type { RolUsuario } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import * as membresiaRepository from "../src/repositories/membresia.repository.js";

/**
 * Bloque B (Fase 2, spec dual-login-routing, diseño "File Changes" —
 * `membresia.repository.ts`). Repositorio golpea la BD real de pruebas,
 * mismo patrón que `bridge.repository.test.ts`.
 */
const BOOTSTRAP_EMPRESA_ID = "00000000-0000-0000-0000-000000000001";

async function crearUsuario(rol: RolUsuario = "ASESOR") {
  return prisma.usuario.create({
    data: {
      nombre: "Usuario Membresia",
      correo: `membresia-${randomUUID()}@t.local`,
      passwordHash: "x",
      rol,
    },
  });
}

describe("repositories/membresia — findByEmail (dual-login-routing)", () => {
  it("encuentra una Membresia activa por correo", async () => {
    const usuario = await crearUsuario();
    const correo = `dual-${randomUUID()}@empresa.local`;
    const membresia = await prisma.membresia.create({
      data: {
        usuarioId: usuario.id,
        empresaId: BOOTSTRAP_EMPRESA_ID,
        rol: "ASESOR",
        correo,
        passwordHash: "hash-guardado",
        activa: true,
      },
    });

    const encontrada = await membresiaRepository.findByEmail(correo);
    expect(encontrada?.id).toBe(membresia.id);
  });

  it("NO encuentra una Membresia inactiva (activa=false) por su correo", async () => {
    const usuario = await crearUsuario();
    const correo = `inactiva-${randomUUID()}@empresa.local`;
    await prisma.membresia.create({
      data: {
        usuarioId: usuario.id,
        empresaId: BOOTSTRAP_EMPRESA_ID,
        rol: "ASESOR",
        correo,
        passwordHash: "hash-guardado",
        activa: false,
      },
    });

    const encontrada = await membresiaRepository.findByEmail(correo);
    expect(encontrada).toBeNull();
  });

  it("devuelve null cuando ninguna Membresia tiene ese correo", async () => {
    const encontrada = await membresiaRepository.findByEmail(`nadie-${randomUUID()}@empresa.local`);
    expect(encontrada).toBeNull();
  });

  it("el correo es case-insensitive (citext)", async () => {
    const usuario = await crearUsuario();
    const correo = `CaseTest-${randomUUID()}@Empresa.Local`;
    await prisma.membresia.create({
      data: {
        usuarioId: usuario.id,
        empresaId: BOOTSTRAP_EMPRESA_ID,
        rol: "ASESOR",
        correo,
        passwordHash: "hash-guardado",
        activa: true,
      },
    });

    const encontrada = await membresiaRepository.findByEmail(correo.toLowerCase());
    expect(encontrada).not.toBeNull();
  });
});

describe("repositories/membresia — findActivasByUsuarioId (Fase 2, hot path shadow authorizer)", () => {
  it("devuelve solo las membresías activas de ese usuario", async () => {
    const usuario = await crearUsuario();
    const otraEmpresa = await prisma.empresa.create({ data: { nombre: `Otra Empresa ${randomUUID()}` } });
    const activa = await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: BOOTSTRAP_EMPRESA_ID, rol: "ASESOR", activa: true },
    });
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: otraEmpresa.id, rol: "SUPERVISOR", activa: false },
    });

    const resultado = await membresiaRepository.findActivasByUsuarioId(usuario.id);

    expect(resultado.map((m) => m.id)).toEqual([activa.id]);
  });

  it("devuelve arreglo vacío si el usuario no tiene ninguna membresía", async () => {
    const usuario = await crearUsuario();
    const resultado = await membresiaRepository.findActivasByUsuarioId(usuario.id);
    expect(resultado).toEqual([]);
  });
});

describe("repositories/membresia — assertCorreoDisponible (cross-table uniqueness guard)", () => {
  it("no lanza cuando el correo no está en uso en ninguna tabla", async () => {
    await expect(
      prisma.$transaction((tx) =>
        membresiaRepository.assertCorreoDisponible(`libre-${randomUUID()}@t.local`, tx),
      ),
    ).resolves.toBeUndefined();
  });

  it("lanza cuando el correo ya pertenece a un Usuario (Cross-table email collision blocked)", async () => {
    const usuario = await crearUsuario();

    await expect(
      prisma.$transaction((tx) => membresiaRepository.assertCorreoDisponible(usuario.correo, tx)),
    ).rejects.toThrow();
  });

  it("lanza cuando el correo ya pertenece a otra Membresia", async () => {
    const usuario = await crearUsuario();
    const correo = `colision-${randomUUID()}@t.local`;
    await prisma.membresia.create({
      data: {
        usuarioId: usuario.id,
        empresaId: BOOTSTRAP_EMPRESA_ID,
        rol: "ASESOR",
        correo,
        passwordHash: "hash-guardado",
      },
    });

    await expect(
      prisma.$transaction((tx) => membresiaRepository.assertCorreoDisponible(correo, tx)),
    ).rejects.toThrow();
  });
});

