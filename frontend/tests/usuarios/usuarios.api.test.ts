import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUsuario } from "@/tipos/usuario";

vi.mock("@/api/httpClient", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const { httpClient } = await import("@/api/httpClient");
const {
  fetchUsuariosApi,
  createUsuarioApi,
  updateUsuarioApi,
  resetPasswordApi,
  deactivateUsuarioApi,
  getCargaActivaDeUsuario,
  getCandidatosReasignacion,
  reassignCarteraActiva,
} = await import("@/funcionalidades/usuarios/usuarios.api");

const getMock = vi.mocked(httpClient.get);
const postMock = vi.mocked(httpClient.post);
const patchMock = vi.mocked(httpClient.patch);
const deleteMock = vi.mocked(httpClient.delete);

function usuarioFake(overrides: Partial<AdminUsuario> = {}): AdminUsuario {
  return {
    id: "u1",
    nombre: "Ana Gómez",
    correo: "ana@crm.test",
    rol: "ASESOR",
    activo: true,
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString(),
    ...overrides,
  };
}

function leadBackendFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "lead-01",
    clienteId: "cliente-01",
    cliente: {
      id: "cliente-01",
      nombre: "Roberto Salazar",
      telefonoOriginal: "0991234567",
      telefonoNormalizado: "+593991234567",
      telefonoValido: true,
    },
    origen: "NUEVO",
    redSocial: "INSTAGRAM",
    etapa: "CONTACTADO",
    semaforo: "ROJO",
    puntuacion: 32,
    asesorId: "asesor-1",
    asesor: { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" },
    vendedorId: null,
    vendedor: null,
    slaInicioEn: new Date().toISOString(),
    ingresadoEn: new Date().toISOString(),
    cerradoEn: null,
    montoVenta: null,
    productoServicio: null,
    formaPago: null,
    observacionCierre: null,
    ...overrides,
  };
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  patchMock.mockReset();
  deleteMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usuarios.api — backend real (F7, distinto de F3-F6)", () => {
  it("fetchUsuariosApi llama a GET /usuarios y devuelve el arreglo `users`", async () => {
    const usuarios = [usuarioFake(), usuarioFake({ id: "u2" })];
    getMock.mockResolvedValue({ users: usuarios });

    const resultado = await fetchUsuariosApi();

    expect(getMock).toHaveBeenCalledWith("/usuarios");
    expect(resultado).toEqual(usuarios);
  });

  it("createUsuarioApi llama a POST /usuarios con el cuerpo dado y devuelve `user`", async () => {
    const nuevo = usuarioFake({ id: "u3" });
    postMock.mockResolvedValue({ user: nuevo });

    const resultado = await createUsuarioApi({
      nombre: "Ana Gómez",
      correo: "ana@crm.test",
      password: "una-contraseña-larga-1",
      rol: "ASESOR",
    });

    expect(postMock).toHaveBeenCalledWith("/usuarios", {
      nombre: "Ana Gómez",
      correo: "ana@crm.test",
      password: "una-contraseña-larga-1",
      rol: "ASESOR",
    });
    expect(resultado).toEqual(nuevo);
  });

  it("updateUsuarioApi llama a PATCH /usuarios/:id con nombre/correo/rol, sin password", async () => {
    const actualizado = usuarioFake({ nombre: "Ana Actualizada" });
    patchMock.mockResolvedValue({ user: actualizado });

    const resultado = await updateUsuarioApi("u1", {
      nombre: "Ana Actualizada",
      correo: "ana@crm.test",
      rol: "ASESOR",
    });

    expect(patchMock).toHaveBeenCalledWith("/usuarios/u1", {
      nombre: "Ana Actualizada",
      correo: "ana@crm.test",
      rol: "ASESOR",
    });
    expect(resultado).toEqual(actualizado);
  });

  it("resetPasswordApi llama a PATCH /usuarios/:id solo con password (sin exigir la contraseña actual)", async () => {
    patchMock.mockResolvedValue({ user: usuarioFake() });

    await resetPasswordApi("u1", "una-contraseña-nueva-1");

    expect(patchMock).toHaveBeenCalledWith("/usuarios/u1", { password: "una-contraseña-nueva-1" });
  });

  it("deactivateUsuarioApi llama a DELETE /usuarios/:id (baja lógica real)", async () => {
    deleteMock.mockResolvedValue(undefined);

    await deactivateUsuarioApi("u1");

    expect(deleteMock).toHaveBeenCalledWith("/usuarios/u1");
  });
});

describe("usuarios.api — carga activa y reasignación (integración F3/F4, backend real de leads)", () => {
  it("getCargaActivaDeUsuario cuenta los leads no terminales devueltos por GET /leads?responsableId=", async () => {
    getMock.mockResolvedValue({
      leads: [
        leadBackendFake({ id: "lead-01", etapa: "CONTACTADO" }),
        leadBackendFake({ id: "lead-02", etapa: "VENTA" }), // terminal, no cuenta
        leadBackendFake({ id: "lead-03", etapa: "NUEVO" }),
      ],
      total: 3,
      pagina: 1,
      limite: 100,
    });

    const carga = await getCargaActivaDeUsuario("asesor-1");

    expect(getMock).toHaveBeenCalledWith(
      "/leads",
      expect.objectContaining({ params: expect.objectContaining({ responsableId: "asesor-1", limite: 100 }) }),
    );
    expect(carga).toBe(2);
  });

  it("getCargaActivaDeUsuario devuelve 0 cuando el backend no reporta leads para ese responsable", async () => {
    getMock.mockResolvedValue({ leads: [], total: 0, pagina: 1, limite: 100 });

    expect(await getCargaActivaDeUsuario("00000000-0000-0000-0000-000000000000")).toBe(0);
  });

  it("getCandidatosReasignacion solo ofrece usuarios del mismo rol operativo, sin incluir al propio usuario", async () => {
    // getCatalogoResponsablesConRol combina rol=ASESOR + rol=VENDEDOR (2 llamadas).
    getMock
      .mockResolvedValueOnce({
        responsables: [
          { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" },
          { id: "asesor-2", nombre: "Julián Peña", rol: "ASESOR" },
        ],
      })
      .mockResolvedValueOnce({ responsables: [{ id: "vendedor-1", nombre: "Sofía Vintimilla", rol: "VENDEDOR" }] });

    const candidatos = await getCandidatosReasignacion("ASESOR", "asesor-1");

    expect(candidatos.map((c) => c.id)).toEqual(["asesor-2"]);
  });

  it("getCandidatosReasignacion devuelve una lista vacía para administrador/supervisor (no cargan cartera), sin llamar al backend", async () => {
    expect(await getCandidatosReasignacion("ADMINISTRADOR", "admin-1")).toEqual([]);
    expect(await getCandidatosReasignacion("SUPERVISOR", "sup-1")).toEqual([]);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("reassignCarteraActiva trae la cartera activa del usuario y llama a POST /leads/asignar-lote con esos ids", async () => {
    getMock.mockResolvedValue({
      leads: [leadBackendFake({ id: "lead-01" }), leadBackendFake({ id: "lead-03" })],
      total: 2,
      pagina: 1,
      limite: 100,
    });
    postMock.mockResolvedValue({
      exitosos: [
        { leadId: "lead-01", asesorId: "asesor-2" },
        { leadId: "lead-03", asesorId: "asesor-2" },
      ],
      fallidos: [],
      resumen: { solicitados: 2, exitosos: 2, fallidos: 0 },
    });

    await reassignCarteraActiva("asesor-1", "asesor-2");

    expect(postMock).toHaveBeenCalledWith("/leads/asignar-lote", {
      leadIds: ["lead-01", "lead-03"],
      asesorId: "asesor-2",
    });
  });

  it("reassignCarteraActiva no llama al backend de asignación si el usuario no tiene cartera activa", async () => {
    getMock.mockResolvedValue({ leads: [], total: 0, pagina: 1, limite: 100 });

    await reassignCarteraActiva("asesor-1", "asesor-2");

    expect(postMock).not.toHaveBeenCalled();
  });
});
