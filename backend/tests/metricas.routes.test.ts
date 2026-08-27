import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

const app = createApp();
const PASSWORD = "clave-de-prueba-123456";

let contador = 0;

function marcador(): string {
  contador += 1;
  return `metrica-routes-${Date.now()}-${contador}`;
}

async function crearUsuarioConToken(
  rol: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "VENDEDOR",
): Promise<{ id: string; token: string }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario MR ${contador}`,
      correo: `usuario-mr-${contador}-${Date.now()}@integracion.test`,
      passwordHash: await hashPassword(PASSWORD),
      rol,
      activo: true,
    },
  });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: usuario.correo, password: PASSWORD });
  return { id: usuario.id, token: login.body.accessToken as string };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("routes/metricas — wiring y autenticación", () => {
  it("401 sin token en cualquiera de los 7 endpoints", async () => {
    const paths = [
      "/api/v1/metricas/resumen",
      "/api/v1/metricas/por-red-social",
      "/api/v1/metricas/por-asesor",
      "/api/v1/metricas/por-etapa",
      "/api/v1/metricas/por-campania",
      "/api/v1/metricas/embudo",
      "/api/v1/metricas/red-social-x-semaforo",
    ];
    for (const path of paths) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });

  it("200 con token válido en /resumen para un administrador", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    const res = await request(app)
      .get("/api/v1/metricas/resumen")
      .set("Authorization", `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalIngresados");
    expect(res.body).toHaveProperty("distribucionSemaforo");
  });

  it("400 cuando rango=personalizado no trae desde/hasta", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    const res = await request(app)
      .get("/api/v1/metricas/resumen?rango=personalizado")
      .set("Authorization", `Bearer ${admin.token}`);
    expect(res.status).toBe(400);
  });

  it("403 cuando un asesor consulta /por-asesor directamente vía HTTP (docs/08 §3.2)", async () => {
    const asesor = await crearUsuarioConToken("ASESOR");
    const res = await request(app)
      .get("/api/v1/metricas/por-asesor")
      .set("Authorization", `Bearer ${asesor.token}`);
    expect(res.status).toBe(403);
  });

  it("200 en /por-asesor para un supervisor", async () => {
    const supervisor = await crearUsuarioConToken("SUPERVISOR");
    const res = await request(app)
      .get("/api/v1/metricas/por-asesor")
      .set("Authorization", `Bearer ${supervisor.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("items");
  });

  it("regresión FIX A: un lead ingresado tarde en el día (22:00 UTC) cuenta en /resumen cuando `hasta` es ese mismo día (docs/08 §4)", async () => {
    const admin = await crearUsuarioConToken("ADMINISTRADOR");
    const cam = marcador();
    const dia = "2026-08-18";
    const cliente = await prisma.cliente.create({
      data: { nombre: `Cliente MR ${cam}`, telefonoValido: false },
    });
    await testAdminPrisma.lead.create({
      data: {
        clienteId: cliente.id,
        origen: "NUEVO",
        etapa: "NUEVO",
        ingresadoEn: new Date(`${dia}T22:00:00.000Z`),
        payloadOriginal: { nombreCampania: cam },
        empresaId: EMPRESA_BOOTSTRAP_ID,
      },
    });

    const res = await request(app)
      .get(
        `/api/v1/metricas/resumen?rango=personalizado&desde=${dia}&hasta=${dia}&campania=${encodeURIComponent(cam)}`,
      )
      .set("Authorization", `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalIngresados.actual).toBe(1);
  });
});
