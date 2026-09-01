import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/repositories/notificacion.repository.js", () => ({
  findActiveRecipientIds: vi.fn(),
  createNotificacion: vi.fn(),
  listByUsuario: vi.fn(),
  markOneRead: vi.fn(),
  markAllRead: vi.fn(),
}));

const repository = await import("../src/repositories/notificacion.repository.js");
const {
  createCanalOProductoFaltanteNotification,
  createForActiveRoles,
  createForActiveSupervisorsAndAdmins,
  createHoldingForActiveRoles,
  createWhatsAppNoConectadoNotification,
} = await import("../src/services/notificaciones.service.js");

const input = {
  tipo: "ERROR_BRIDGE" as const,
  titulo: "Error de bridge",
  mensaje: "Se detectó un error",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repository.findActiveRecipientIds).mockResolvedValue(["usuario-1"]);
  vi.mocked(repository.createNotificacion).mockImplementation(async (data) => data as never);
});

describe("notificaciones company scope", () => {
  it("persiste la empresa obligatoria en cada notificación derivada", async () => {
    await createForActiveRoles(["SUPERVISOR"], input, "empresa-A");

    expect(repository.findActiveRecipientIds).toHaveBeenCalledWith(
      ["SUPERVISOR"],
      "empresa-A",
      expect.anything(),
    );
    expect(repository.createNotificacion).toHaveBeenCalledWith(
      { usuarioId: "usuario-1", ...input, empresaId: "empresa-A" },
      expect.anything(),
    );
  });

  it("aplica el mismo scope al fan-out de supervisores y administradores", async () => {
    await createForActiveSupervisorsAndAdmins(input, "empresa-B");

    expect(repository.createNotificacion).toHaveBeenCalledWith(
      { usuarioId: "usuario-1", ...input, empresaId: "empresa-B" },
      expect.anything(),
    );
  });

  it("solo la API holding explícita puede persistir empresaId null", async () => {
    await createHoldingForActiveRoles(["ADMINISTRADOR"], input);

    expect(repository.findActiveRecipientIds).toHaveBeenCalledWith(
      ["ADMINISTRADOR"],
      null,
      expect.anything(),
    );
    expect(repository.createNotificacion).toHaveBeenCalledWith(
      { usuarioId: "usuario-1", ...input, empresaId: null },
      expect.anything(),
    );
  });

  it("rechaza un scope de empresa ausente en vez de degradar a holding", async () => {
    await expect(
      createForActiveRoles(["SUPERVISOR"], input, undefined as never),
    ).rejects.toMatchObject({ code: "contexto_empresa_no_resuelto", statusHttp: 422 });
    expect(repository.createNotificacion).not.toHaveBeenCalled();
  });
});

describe("createCanalOProductoFaltanteNotification (pre-deploy, aviso Supervisor/Asesor → Administrador)", () => {
  it("arma titulo/mensaje por default y siempre notifica solo a ADMINISTRADOR con metadata estructurada", async () => {
    await createCanalOProductoFaltanteNotification(
      { recurso: "canal", nombreSugerido: "WhatsApp Business" },
      "empresa-A",
    );

    expect(repository.findActiveRecipientIds).toHaveBeenCalledWith(
      ["ADMINISTRADOR"],
      "empresa-A",
      expect.anything(),
    );
    expect(repository.createNotificacion).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarioId: "usuario-1",
        tipo: "CANAL_O_PRODUCTO_FALTANTE",
        titulo: "Falta un canal activo",
        mensaje:
          'Un asesor necesita cargar un lead pero no hay canal activo con nombre sugerido "WhatsApp Business".',
        metadata: { recurso: "canal", nombreSugerido: "WhatsApp Business" },
        empresaId: "empresa-A",
      }),
      expect.anything(),
    );
  });

  it("usa el mensaje del cliente y mergea metadata extra sin perder recurso/nombreSugerido (triangulación)", async () => {
    await createCanalOProductoFaltanteNotification(
      {
        recurso: "producto",
        nombreSugerido: "Plan Premium",
        mensaje: "Mensaje custom del asesor",
        metadata: { origenPantalla: "wizard-carga-lead" },
      },
      "empresa-B",
    );

    expect(repository.createNotificacion).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: "Falta un producto activo",
        mensaje: "Mensaje custom del asesor",
        metadata: {
          recurso: "producto",
          nombreSugerido: "Plan Premium",
          origenPantalla: "wizard-carga-lead",
        },
        empresaId: "empresa-B",
      }),
      expect.anything(),
    );
  });

  it("rechaza empresaId null (alcance holding-wide) en vez de asumir una empresa", async () => {
    await expect(
      createCanalOProductoFaltanteNotification(
        { recurso: "canal", nombreSugerido: "WhatsApp Business" },
        null,
      ),
    ).rejects.toMatchObject({ code: "contexto_empresa_no_resuelto", statusHttp: 422 });
    expect(repository.createNotificacion).not.toHaveBeenCalled();
  });
});

describe("createWhatsAppNoConectadoNotification (pre-deploy, aviso Supervisor/Asesor → Administrador)", () => {
  it("notifica solo a ADMINISTRADOR con el mensaje del cliente y sin metadata", async () => {
    await createWhatsAppNoConectadoNotification(
      "El lead no tiene WhatsApp conectado, ¿lo pueden habilitar?",
      "empresa-A",
    );

    expect(repository.findActiveRecipientIds).toHaveBeenCalledWith(
      ["ADMINISTRADOR"],
      "empresa-A",
      expect.anything(),
    );
    expect(repository.createNotificacion).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarioId: "usuario-1",
        tipo: "WHATSAPP_NO_CONECTADO",
        titulo: "WhatsApp no conectado",
        mensaje: "El lead no tiene WhatsApp conectado, ¿lo pueden habilitar?",
        empresaId: "empresa-A",
      }),
      expect.anything(),
    );
    expect(
      vi.mocked(repository.createNotificacion).mock.calls[0]?.[0],
    ).not.toHaveProperty("metadata");
  });

  it("rechaza empresaId null (alcance holding-wide) en vez de asumir una empresa", async () => {
    await expect(
      createWhatsAppNoConectadoNotification("Mensaje del asesor", null),
    ).rejects.toMatchObject({ code: "contexto_empresa_no_resuelto", statusHttp: 422 });
    expect(repository.createNotificacion).not.toHaveBeenCalled();
  });
});
