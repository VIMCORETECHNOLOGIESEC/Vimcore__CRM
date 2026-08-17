import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import * as usuarioRepository from "../src/repositories/usuario.repository.js";

/**
 * D-A2 (revisión 2, tests 3.9/3.10): solo se mockea `findActivosPorRol`
 * — el ÚNICO punto que `assignAutomatically`/`selectResponsable` tocan
 * durante el intento de asignación POST-commit. A propósito NO se mockea
 * `createEvento` aquí (a diferencia de `asignacion.service.test.ts`):
 * `createEvento` también lo usa `deduplicacion.service.ts` para el evento
 * INGRESO *dentro* de la transacción de ingesta, antes del commit — mockear
 * ese punto haría fallar la transacción completa (recepción+dedupe) en vez
 * de simular específicamente un fallo de la asignación POST-commit.
 */
vi.mock("../src/repositories/usuario.repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/repositories/usuario.repository.js")>();
  return { ...actual, findActivosPorRol: vi.fn(actual.findActivosPorRol) };
});

const app = createApp();
const CLAVE_API = "clave-http-integracion-096";

let bridgeId: string;
let contador = 0;

beforeAll(async () => {
  const bridge = await prisma.bridge.create({
    data: {
      redSocial: "GOOGLE_FORMS",
      nombre: "Bridge de prueba HTTP",
      claveApiHash: hashClaveBridge(CLAVE_API),
      estado: "ACTIVO",
    },
  });
  bridgeId = bridge.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Prefijo "096" (distinto de "097"/"098"/"099" ya usados por otros
 * archivos, D-H) para que ningún teléfono normalizado colisione cuando la
 * suite completa corre sin truncar entre archivos. */
function cuerpoBase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  contador += 1;
  return {
    idExternoLead: `externo-http-${contador}`,
    nombre: "Cliente HTTP",
    telefono: `096${String(contador).padStart(7, "0")}`,
    correo: null,
    ...overrides,
  };
}

describe("POST /api/v1/ingesta/generico", () => {
  it("401 sin X-Bridge-Key: registra ERROR en bridge_logs y no persiste nada (Requirement: Bridge authentication)", async () => {
    const cuerpo = cuerpoBase();

    const respuesta = await request(app).post("/api/v1/ingesta/generico").send(cuerpo);

    expect(respuesta.status).toBe(401);
    const log = await prisma.bridgeLog.findFirst({
      where: { bridgeId: null, nivel: "ERROR", mensaje: "Falta el encabezado X-Bridge-Key" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log).not.toBeNull();

    const recepcion = await prisma.leadRecibido.findFirst({
      where: { idExternoLead: cuerpo.idExternoLead as string },
    });
    expect(recepcion).toBeNull();
  });

  it("401 con X-Bridge-Key malformada: registra ERROR y no persiste nada (Scenario: Invalid signature rejected)", async () => {
    const cuerpo = cuerpoBase();

    const respuesta = await request(app)
      .post("/api/v1/ingesta/generico")
      .set("X-Bridge-Key", "!!clave-malformada??")
      .send(cuerpo);

    expect(respuesta.status).toBe(401);
    const log = await prisma.bridgeLog.findFirst({
      where: { bridgeId: null, nivel: "ERROR", mensaje: "X-Bridge-Key inválida o bridge inactivo" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log).not.toBeNull();

    const recepcion = await prisma.leadRecibido.findFirst({
      where: { idExternoLead: cuerpo.idExternoLead as string },
    });
    expect(recepcion).toBeNull();
  });

  it("401 con X-Bridge-Key bien formada pero no registrada: registra ERROR y no persiste nada (Scenario: Invalid signature rejected)", async () => {
    const cuerpo = cuerpoBase();

    const respuesta = await request(app)
      .post("/api/v1/ingesta/generico")
      .set("X-Bridge-Key", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")
      .send(cuerpo);

    expect(respuesta.status).toBe(401);
    const log = await prisma.bridgeLog.findFirst({
      where: { bridgeId: null, nivel: "ERROR", mensaje: "X-Bridge-Key inválida o bridge inactivo" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log).not.toBeNull();

    const recepcion = await prisma.leadRecibido.findFirst({
      where: { idExternoLead: cuerpo.idExternoLead as string },
    });
    expect(recepcion).toBeNull();
  });

  it("200 con X-Bridge-Key válida: crea el lead y nunca expone la clave en la respuesta (Scenario: Key never exposed)", async () => {
    const cuerpo = cuerpoBase();

    const respuesta = await request(app)
      .post("/api/v1/ingesta/generico")
      .set("X-Bridge-Key", CLAVE_API)
      .send(cuerpo);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.duplicado).toBe(false);
    expect(typeof respuesta.body.leadId).toBe("string");
    expect(JSON.stringify(respuesta.body)).not.toContain(CLAVE_API);
    expect(JSON.stringify(respuesta.body)).not.toContain(hashClaveBridge(CLAVE_API));

    const recepcion = await prisma.leadRecibido.findFirstOrThrow({
      where: { bridgeId, idExternoLead: cuerpo.idExternoLead as string },
    });
    expect(recepcion.leadId).toBe(respuesta.body.leadId);
  });

  it("reintento HTTP de la misma pareja (bridgeId, idExternoLead) devuelve 200 idempotente sin crear un segundo lead", async () => {
    const cuerpo = cuerpoBase();

    const primera = await request(app)
      .post("/api/v1/ingesta/generico")
      .set("X-Bridge-Key", CLAVE_API)
      .send(cuerpo);
    expect(primera.status).toBe(200);

    const segunda = await request(app)
      .post("/api/v1/ingesta/generico")
      .set("X-Bridge-Key", CLAVE_API)
      .send(cuerpo);

    expect(segunda.status).toBe(200);
    expect(segunda.body.leadId).toBe(primera.body.leadId);
    expect(segunda.body.duplicado).toBe(true);

    const totalRecepciones = await prisma.leadRecibido.count({
      where: { bridgeId, idExternoLead: cuerpo.idExternoLead as string },
    });
    expect(totalRecepciones).toBe(1);
  });

  it("200 con el leadId committeado aunque la asignación automática post-commit agote sus 3 reintentos (Scenario negativo: fallo de asignación no produce 500)", async () => {
    const cuerpo = cuerpoBase();

    const mockFindActivos = vi.mocked(usuarioRepository.findActivosPorRol);
    mockFindActivos.mockRejectedValueOnce(new Error("fallo asignacion post-commit 1"));
    mockFindActivos.mockRejectedValueOnce(new Error("fallo asignacion post-commit 2"));
    mockFindActivos.mockRejectedValueOnce(new Error("fallo asignacion post-commit 3"));

    const respuesta = await request(app)
      .post("/api/v1/ingesta/generico")
      .set("X-Bridge-Key", CLAVE_API)
      .send(cuerpo);

    expect(respuesta.status).toBe(200);
    expect(typeof respuesta.body.leadId).toBe("string");
    expect(respuesta.body.duplicado).toBe(false);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: respuesta.body.leadId } });
    expect(lead.asesorId).toBeNull();

    const eventoFallido = await prisma.leadEvento.findFirst({
      where: { leadId: lead.id, tipo: "ASIGNACION_FALLIDA" },
    });
    expect(eventoFallido).not.toBeNull();
  }, 10_000);

  it("el reintento del bridge tras un fallo de asignación entra por deduplicación y NO reintenta la asignación (Scenario: el reintento del bridge no repararía el fallo de asignación)", async () => {
    const cuerpo = cuerpoBase();

    const mockFindActivos = vi.mocked(usuarioRepository.findActivosPorRol);
    mockFindActivos.mockRejectedValueOnce(new Error("fallo asignacion post-commit 1"));
    mockFindActivos.mockRejectedValueOnce(new Error("fallo asignacion post-commit 2"));
    mockFindActivos.mockRejectedValueOnce(new Error("fallo asignacion post-commit 3"));

    // Delta, no total acumulado: otras pruebas de este archivo también
    // disparan ingesta -> asignarTrasCommit -> findActivosPorRol en el
    // camino feliz, así que el mock compartido ya trae llamadas previas.
    const llamadasAntesDePrimera = mockFindActivos.mock.calls.length;

    const primera = await request(app)
      .post("/api/v1/ingesta/generico")
      .set("X-Bridge-Key", CLAVE_API)
      .send(cuerpo);
    expect(primera.status).toBe(200);
    expect(primera.body.duplicado).toBe(false);

    const eventosTrasPrimera = await prisma.leadEvento.count({
      where: { leadId: primera.body.leadId, tipo: "ASIGNACION_FALLIDA" },
    });
    expect(eventosTrasPrimera).toBe(1);
    expect(mockFindActivos.mock.calls.length - llamadasAntesDePrimera).toBe(3);

    const llamadasAntesDeSegunda = mockFindActivos.mock.calls.length;

    const segunda = await request(app)
      .post("/api/v1/ingesta/generico")
      .set("X-Bridge-Key", CLAVE_API)
      .send(cuerpo);

    expect(segunda.status).toBe(200);
    expect(segunda.body.duplicado).toBe(true);
    expect(segunda.body.leadId).toBe(primera.body.leadId);

    // Sin cambios: el reingreso entró por ON CONFLICT (duplicado: true) y
    // nunca volvió a invocar la asignación automática — cero llamadas
    // nuevas a findActivosPorRol y cero eventos ASIGNACION_FALLIDA nuevos.
    const eventosTrasSegunda = await prisma.leadEvento.count({
      where: { leadId: primera.body.leadId, tipo: "ASIGNACION_FALLIDA" },
    });
    expect(eventosTrasSegunda).toBe(1);
    expect(mockFindActivos.mock.calls.length - llamadasAntesDeSegunda).toBe(0);
  }, 10_000);
});
