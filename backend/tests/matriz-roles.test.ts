import type { RolUsuario } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

/**
 * Matriz de roles (D9, tasks 5.5): solo `ADMINISTRADOR` opera el CRUD de
 * usuarios; los otros 3 roles reciben 403 en **cada** endpoint. Parametrizada
 * por rol × endpoint, como la matriz de `docs/06` L45 hace por endpoint × caso.
 */
const app = createApp();
const PASSWORD = "clave-matriz-123456";

const roles: RolUsuario[] = ["ADMINISTRADOR", "SUPERVISOR", "ASESOR", "VENDEDOR"];
const accessTokenByRole = new Map<RolUsuario, string>();
let objetivoId: string;

beforeAll(async () => {
  for (const rol of roles) {
    const usuario = await prisma.usuario.create({
      data: {
        nombre: `Matriz ${rol}`,
        correo: `matriz-${rol.toLowerCase()}@integracion.test`,
        passwordHash: await hashPassword(PASSWORD),
        rol,
        activo: true,
      },
    });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ correo: usuario.correo, password: PASSWORD });
    accessTokenByRole.set(rol, login.body.accessToken);
  }

  // Usuario objetivo sobre el que se ejercen GET/PATCH/DELETE por id.
  const objetivo = await prisma.usuario.create({
    data: {
      nombre: "Objetivo Matriz",
      correo: "objetivo-matriz@integracion.test",
      passwordHash: await hashPassword(PASSWORD),
      rol: "VENDEDOR",
      activo: true,
    },
  });
  objetivoId = objetivo.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

interface CasoEndpoint {
  nombre: string;
  ejecutar: (token: string) => Promise<request.Response>;
  statusExitoso: number;
}

function casos(): CasoEndpoint[] {
  return [
    {
      nombre: "POST /usuarios",
      ejecutar: (token) =>
        request(app)
          .post("/api/v1/usuarios")
          .set("Authorization", `Bearer ${token}`)
          .send({
            nombre: `Creado por matriz ${Math.random()}`,
            correo: `creado-${Date.now()}-${Math.random()}@integracion.test`,
            password: "clave-generada-123456",
            rol: "ASESOR",
          }),
      statusExitoso: 201,
    },
    {
      nombre: "GET /usuarios",
      ejecutar: (token) =>
        request(app).get("/api/v1/usuarios").set("Authorization", `Bearer ${token}`),
      statusExitoso: 200,
    },
    {
      nombre: "GET /usuarios/:id",
      ejecutar: (token) =>
        request(app)
          .get(`/api/v1/usuarios/${objetivoId}`)
          .set("Authorization", `Bearer ${token}`),
      statusExitoso: 200,
    },
    {
      nombre: "PATCH /usuarios/:id",
      ejecutar: (token) =>
        request(app)
          .patch(`/api/v1/usuarios/${objetivoId}`)
          .set("Authorization", `Bearer ${token}`)
          .send({ nombre: "Renombrado por matriz" }),
      statusExitoso: 200,
    },
  ];
}

describe("Matriz de roles × endpoints del CRUD de usuarios (D9)", () => {
  for (const caso of casos()) {
    it(`${caso.nombre}: ADMINISTRADOR pasa, los otros 3 roles reciben 403`, async () => {
      for (const rol of roles) {
        const token = accessTokenByRole.get(rol);
        if (!token) throw new Error(`Falta token para rol ${rol}`);

        const respuesta = await caso.ejecutar(token);

        if (rol === "ADMINISTRADOR") {
          expect(respuesta.status).toBe(caso.statusExitoso);
        } else {
          expect(respuesta.status).toBe(403);
        }
      }
    });
  }

  it("DELETE /usuarios/:id: solo ADMINISTRADOR puede dar de baja; los otros 3 roles reciben 403", async () => {
    for (const rol of roles) {
      if (rol === "ADMINISTRADOR") continue;

      const objetivoNoAdmin = await prisma.usuario.create({
        data: {
          nombre: `Objetivo baja ${rol}`,
          correo: `objetivo-baja-${rol.toLowerCase()}@integracion.test`,
          passwordHash: await hashPassword(PASSWORD),
          rol: "VENDEDOR",
          activo: true,
        },
      });

      const token = accessTokenByRole.get(rol);
      if (!token) throw new Error(`Falta token para rol ${rol}`);

      const respuesta = await request(app)
        .delete(`/api/v1/usuarios/${objetivoNoAdmin.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(respuesta.status).toBe(403);
    }

    const objetivoAdmin = await prisma.usuario.create({
      data: {
        nombre: "Objetivo baja admin",
        correo: "objetivo-baja-admin@integracion.test",
        passwordHash: await hashPassword(PASSWORD),
        rol: "VENDEDOR",
        activo: true,
      },
    });
    const tokenAdmin = accessTokenByRole.get("ADMINISTRADOR");
    if (!tokenAdmin) throw new Error("Falta token para ADMINISTRADOR");

    const respuesta = await request(app)
      .delete(`/api/v1/usuarios/${objetivoAdmin.id}`)
      .set("Authorization", `Bearer ${tokenAdmin}`);

    expect(respuesta.status).toBe(204);
  });
});
