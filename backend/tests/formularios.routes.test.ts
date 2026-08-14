import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const PASSWORD = "clave-de-prueba-123456";

let contador = 0;

async function crearUsuarioConToken(): Promise<{ token: string }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario FR ${contador}`,
      correo: `usuario-fr-${contador}@integracion.test`,
      passwordHash: await hashPassword(PASSWORD),
      rol: "ASESOR",
      activo: true,
    },
  });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: usuario.correo, password: PASSWORD });
  return { token: login.body.accessToken as string };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/v1/formularios/:etapa (spec: Definición de formulario por etapa)", () => {
  it("401 sin token de acceso", async () => {
    const respuesta = await request(app).get("/api/v1/formularios/CONTACTADO");
    expect(respuesta.status).toBe(401);
  });

  it("200: CONTACTADO devuelve sus 6 preguntas, pesos y calificable:true", async () => {
    const usuario = await crearUsuarioConToken();

    const respuesta = await request(app)
      .get("/api/v1/formularios/CONTACTADO")
      .set("Authorization", `Bearer ${usuario.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.formulario.etapa).toBe("CONTACTADO");
    expect(respuesta.body.formulario.calificable).toBe(true);
    expect(respuesta.body.formulario.preguntas).toHaveLength(6);
  });

  it("400: una etapa fuera del enum se rechaza", async () => {
    const usuario = await crearUsuarioConToken();

    const respuesta = await request(app)
      .get("/api/v1/formularios/NO_EXISTE")
      .set("Authorization", `Bearer ${usuario.token}`);

    expect(respuesta.status).toBe(400);
  });
});
