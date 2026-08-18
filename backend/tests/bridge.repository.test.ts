import { describe, expect, it } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import * as bridgeRepository from "../src/repositories/bridge.repository.js";

let contador = 0;

/** Clave de API única por prueba — evita colisión del índice UNIQUE. */
function claveApiUnica(): string {
  contador += 1;
  return `clave-api-prueba-${contador}`;
}

async function crearBridge(): Promise<{ id: string; claveApi: string }> {
  const claveApi = claveApiUnica();
  const bridge = await prisma.bridge.create({
    data: {
      redSocial: "GOOGLE_FORMS",
      nombre: `Bridge de prueba ${contador}`,
      claveApiHash: hashClaveBridge(claveApi),
      estado: "ACTIVO",
    },
  });

  return { id: bridge.id, claveApi };
}

describe("repositories/bridge — findByClaveApiHash (M4, PR1)", () => {
  it("encuentra el bridge cuyo hash de clave coincide exactamente", async () => {
    const { id, claveApi } = await crearBridge();

    const encontrado = await bridgeRepository.findByClaveApiHash(hashClaveBridge(claveApi));

    expect(encontrado?.id).toBe(id);
  });

  it("devuelve null cuando ningún bridge tiene ese hash de clave", async () => {
    const encontrado = await bridgeRepository.findByClaveApiHash(hashClaveBridge("clave-que-no-existe"));

    expect(encontrado).toBeNull();
  });
});

describe("repositories/bridge — touchUltimoLeadEn (M4, PR1)", () => {
  it("actualiza ultimoLeadEn a un timestamp reciente", async () => {
    const { id } = await crearBridge();
    const antes = await prisma.bridge.findUniqueOrThrow({ where: { id } });
    expect(antes.ultimoLeadEn).toBeNull();

    const momentoAntes = Date.now();
    await bridgeRepository.touchUltimoLeadEn(id);
    const despues = await prisma.bridge.findUniqueOrThrow({ where: { id } });

    expect(despues.ultimoLeadEn).not.toBeNull();
    expect(despues.ultimoLeadEn!.getTime()).toBeGreaterThanOrEqual(momentoAntes);
  });
});

describe("repositories/bridge — create (m4-bridges-crud-fundacion, PR1.7)", () => {
  it("crea el bridge y aplica el default de esquema estado=INACTIVO (la invariante la fuerza el servicio, PR2)", async () => {
    const claveApiHash = hashClaveBridge(claveApiUnica());

    const bridge = await bridgeRepository.create({
      redSocial: "FACEBOOK",
      nombre: "Bridge nuevo PR1.7",
      claveApiHash,
    });

    expect(bridge.estado).toBe("INACTIVO");
    expect(bridge.redSocial).toBe("FACEBOOK");
    expect(bridge.claveApiHash).toBe(claveApiHash);
  });
});

describe("repositories/bridge — list (m4-bridges-crud-fundacion, PR1.7)", () => {
  it("lista únicamente los bridges creados en esta prueba, ordenados por nombre", async () => {
    const a = await bridgeRepository.create({
      redSocial: "X",
      nombre: "ZZZ bridge de lista",
      claveApiHash: hashClaveBridge(claveApiUnica()),
    });
    const b = await bridgeRepository.create({
      redSocial: "X",
      nombre: "AAA bridge de lista",
      claveApiHash: hashClaveBridge(claveApiUnica()),
    });

    const lista = await bridgeRepository.list();
    const ids = lista.map((bridge) => bridge.id);
    const indiceA = ids.indexOf(a.id);
    const indiceB = ids.indexOf(b.id);

    expect(indiceA).toBeGreaterThan(-1);
    expect(indiceB).toBeGreaterThan(-1);
    expect(indiceB).toBeLessThan(indiceA);
  });
});

describe("repositories/bridge — findById con cuentasPublicitarias (m4-bridges-crud-fundacion, PR1.7)", () => {
  it("embebe las cuentas publicitarias del bridge", async () => {
    const { id } = await crearBridge();
    await prisma.cuentaPublicitaria.create({
      data: { bridgeId: id, idExterno: `page-findbyid-${id}`, nombre: "Página embebida" },
    });

    const encontrado = await bridgeRepository.findById(id);

    expect(encontrado?.cuentasPublicitarias).toHaveLength(1);
    expect(encontrado?.cuentasPublicitarias[0]?.nombre).toBe("Página embebida");
  });

  it("devuelve cuentasPublicitarias vacío cuando el bridge no tiene ninguna", async () => {
    const { id } = await crearBridge();

    const encontrado = await bridgeRepository.findById(id);

    expect(encontrado?.cuentasPublicitarias).toEqual([]);
  });

  it("devuelve null cuando el bridge no existe", async () => {
    const encontrado = await bridgeRepository.findById("00000000-0000-0000-0000-000000000000");

    expect(encontrado).toBeNull();
  });
});

describe("repositories/bridge — update (m4-bridges-crud-fundacion, PR1.7)", () => {
  it("actualiza nombre y estado", async () => {
    const { id } = await crearBridge();

    const actualizado = await bridgeRepository.update(id, { nombre: "Renombrado PR1.7", estado: "INACTIVO" });

    expect(actualizado.nombre).toBe("Renombrado PR1.7");
    expect(actualizado.estado).toBe("INACTIVO");
  });
});

describe("repositories/bridge — eliminar (m4-bridges-crud-fundacion, PR1.7)", () => {
  it("elimina físicamente la fila", async () => {
    const { id } = await crearBridge();

    await bridgeRepository.eliminar(id);

    const encontrado = await prisma.bridge.findUnique({ where: { id } });
    expect(encontrado).toBeNull();
  });
});

describe("repositories/bridge — countLeadsRecibidos (m4-bridges-crud-fundacion, PR1.7)", () => {
  it("cuenta las filas leads_recibidos asociadas al bridge", async () => {
    const { id } = await crearBridge();
    await prisma.leadRecibido.create({
      data: { bridgeId: id, idExternoLead: `count-${id}-1`, payload: {}, entradaProcesamiento: {} },
    });
    await prisma.leadRecibido.create({
      data: { bridgeId: id, idExternoLead: `count-${id}-2`, payload: {}, entradaProcesamiento: {} },
    });

    const total = await bridgeRepository.countLeadsRecibidos(id);

    expect(total).toBe(2);
  });

  it("devuelve 0 cuando el bridge no recibió ningún lead", async () => {
    const { id } = await crearBridge();

    const total = await bridgeRepository.countLeadsRecibidos(id);

    expect(total).toBe(0);
  });
});

describe("repositories/bridge — updateClaveApiHash (m4-bridges-crud-fundacion, PR1.7)", () => {
  it("reemplaza el hash de clave persistido, sin tocar estado", async () => {
    const { id } = await crearBridge();
    const nuevoHash = hashClaveBridge(claveApiUnica());

    const actualizado = await bridgeRepository.updateClaveApiHash(id, nuevoHash);

    expect(actualizado.claveApiHash).toBe(nuevoHash);
    expect(actualizado.estado).toBe("ACTIVO");
  });
});

describe("repositories/bridge — listRedesActivas (m4-bridges-crud-fundacion, PR1.7)", () => {
  it("deduplica redSocial entre bridges existentes", async () => {
    await bridgeRepository.create({
      redSocial: "LINKEDIN",
      nombre: "LinkedIn bridge 1",
      claveApiHash: hashClaveBridge(claveApiUnica()),
    });
    await bridgeRepository.create({
      redSocial: "LINKEDIN",
      nombre: "LinkedIn bridge 2",
      claveApiHash: hashClaveBridge(claveApiUnica()),
    });

    const redes = await bridgeRepository.listRedesActivas();
    const ocurrencias = redes.filter((r) => r === "LINKEDIN");

    expect(ocurrencias).toHaveLength(1);
  });
});
