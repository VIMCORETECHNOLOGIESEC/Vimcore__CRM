import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";

/**
 * Fix (bug de seguridad: chat de WhatsApp invisible para todo rol que no
 * fuera ADMINISTRADOR) — `whatsapp.routes.ts::GET /whatsapp/conexion` ya no
 * exige `requireRole("ADMINISTRADOR")`, solo `requireAuthentication`. Mismo
 * estilo/harness que `tests/adversarial/http-cross-company.test.ts`: Prisma
 * real (`testAdminPrisma` para arrange), login real vía `Membresia` para
 * obtener un `sessionScope: "company"` genuino, `request(app)` end-to-end.
 */

const app = createApp();
const PASSWORD = "clave-whatsapp-conexion-123456";

interface EmpresaMembro {
  empresaId: string;
  token: string;
}

/**
 * `rol` es el `RolUsuario` legado que este helper simula a nivel de sesión
 * de empresa. `RolMembresia` solo tiene `ADMINISTRADOR`/`SUPERVISOR`/
 * `ASESOR` -- "VENDEDOR" se representa como
 * `Membresia(rol: ASESOR, habilitadoParaVenta: true)` (ver
 * `lib/rol-membresia.ts::rolEquivalente`), nunca como un `RolMembresia`
 * propio.
 */
async function crearMiembroDeEmpresa(
  etiqueta: string,
  rol: "ASESOR" | "VENDEDOR",
): Promise<EmpresaMembro> {
  const empresa = await testAdminPrisma.empresa.create({
    data: { nombre: `WhatsApp conexion ${etiqueta} ${crypto.randomUUID()}` },
  });
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre: `${rol} whatsapp conexion ${etiqueta}`,
      correo: `usuario-whatsapp-conexion-${etiqueta}-${crypto.randomUUID()}@test.local`,
      passwordHash: await hashPassword(PASSWORD),
      rol,
      activo: true,
    },
  });
  const correoMembresia = `membresia-whatsapp-conexion-${etiqueta}-${crypto.randomUUID()}@test.local`;
  await testAdminPrisma.membresia.create({
    data: {
      usuarioId: usuario.id,
      empresaId: empresa.id,
      rol: "ASESOR",
      correo: correoMembresia,
      passwordHash: await hashPassword(PASSWORD),
      activa: true,
      habilitadoParaVenta: rol === "VENDEDOR",
    },
  });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ correo: correoMembresia, password: PASSWORD });
  expect(login.status, `login de ${etiqueta}`).toBe(200);
  expect(login.body.accessToken).toEqual(expect.any(String));
  return { empresaId: empresa.id, token: login.body.accessToken as string };
}

afterAll(async () => {
  await prisma.$disconnect();
  await testAdminPrisma.$disconnect();
});

describe("GET /whatsapp/conexion — RBAC de lectura abierto a cualquier rol autenticado", () => {
  it("200: un ASESOR company-scoped puede leer el estado de conexión de SU propia empresa (null si no hay conexión)", async () => {
    const asesor = await crearMiembroDeEmpresa("asesor-sin-conexion", "ASESOR");

    const respuesta = await request(app)
      .get("/api/v1/whatsapp/conexion")
      .set("Authorization", `Bearer ${asesor.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ conexion: null });
  });

  it("200: un VENDEDOR company-scoped ve la conexión ACTIVA real de su propia empresa", async () => {
    const vendedor = await crearMiembroDeEmpresa("vendedor-con-conexion", "VENDEDOR");
    const conexion = await testAdminPrisma.whatsAppConexion.create({
      data: {
        empresaId: vendedor.empresaId,
        numeroTelefonoId: `numero-${crypto.randomUUID()}`,
        numeroDisplay: "+54 9 11 5555-5555",
        wabaId: `waba-${crypto.randomUUID()}`,
        tokenCifrado: "token-cifrado-de-prueba-no-real",
        tokenExpiraEn: null,
        estado: "ACTIVA",
      },
    });

    const respuesta = await request(app)
      .get("/api/v1/whatsapp/conexion")
      .set("Authorization", `Bearer ${vendedor.token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.conexion).toMatchObject({
      id: conexion.id,
      empresaId: vendedor.empresaId,
      numeroTelefonoId: conexion.numeroTelefonoId,
      numeroDisplay: conexion.numeroDisplay,
      wabaId: conexion.wabaId,
      estado: "ACTIVA",
    });
    // El DTO nunca expone el token, ni siquiera parcialmente.
    expect(JSON.stringify(respuesta.body)).not.toContain("token-cifrado-de-prueba-no-real");
    expect(respuesta.body.conexion.tokenCifrado).toBeUndefined();
  });

  it("regresión de aislamiento: un ASESOR de empresa A no ve la conexión de empresa B ni pasando ?empresaId=B", async () => {
    const [asesorA, empresaB] = await Promise.all([
      crearMiembroDeEmpresa("aislamiento-a", "ASESOR"),
      testAdminPrisma.empresa.create({
        data: { nombre: `WhatsApp conexion aislamiento-b ${crypto.randomUUID()}` },
      }),
    ]);
    await testAdminPrisma.whatsAppConexion.create({
      data: {
        empresaId: empresaB.id,
        numeroTelefonoId: `numero-b-${crypto.randomUUID()}`,
        numeroDisplay: "+54 9 11 4444-4444",
        wabaId: `waba-b-${crypto.randomUUID()}`,
        tokenCifrado: "token-cifrado-de-empresa-b",
        tokenExpiraEn: null,
        estado: "ACTIVA",
      },
    });

    const respuesta = await request(app)
      .get("/api/v1/whatsapp/conexion")
      .query({ empresaId: empresaB.id })
      .set("Authorization", `Bearer ${asesorA.token}`);

    expect(respuesta.status).toBe(200);
    // `usuario.empresaId ?? parsed.data.empresaId` ignora el query param
    // para una sesión company-scoped: sigue viendo la SUYA (sin conexión).
    expect(respuesta.body).toEqual({ conexion: null });
  });

  it("401: rechaza una petición sin token (sin cambios — requireAuthentication sigue vigente)", async () => {
    const respuesta = await request(app).get("/api/v1/whatsapp/conexion");

    expect(respuesta.status).toBe(401);
  });
});
