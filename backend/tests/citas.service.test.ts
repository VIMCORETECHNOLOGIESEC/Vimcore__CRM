import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import {
  cancelCita,
  getCitaById,
  listCitasByLead,
  scheduleCita,
} from "../src/services/citas.service.js";
import type { UsuarioAcceso } from "../src/services/leads.access.js";

let contador = 0;

async function crearUsuario(rol: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "VENDEDOR"): Promise<{
  id: string;
  rol: typeof rol;
}> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario citas ${contador}`,
      correo: `usuario-citas-${contador}@integracion.test`,
      passwordHash: "hash-no-usado",
      rol,
      activo: true,
    },
  });
  return { id: usuario.id, rol };
}

function comoActor(usuario: { id: string; rol: UsuarioAcceso["rol"] }): UsuarioAcceso {
  return { id: usuario.id, rol: usuario.rol };
}

async function crearLead(
  overrides: Partial<{
    etapa: "NUEVO" | "CONTACTADO" | "CITA" | "VENTA" | "NO_VENTA";
    asesorId: string | null;
    vendedorId: string | null;
  }> = {},
): Promise<{ id: string }> {
  contador += 1;
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente citas ${contador}`, telefonoValido: false },
  });
  const lead = await prisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: overrides.etapa ?? "CONTACTADO",
      asesorId: overrides.asesorId ?? null,
      vendedorId: overrides.vendedorId ?? null,
      ingresadoEn: new Date(),
    },
  });
  return { id: lead.id };
}

function enUnaHora(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("citas.service — scheduleCita (M7, CRUD + evento CITA_AGENDADA)", () => {
  it("el responsable operativo agenda una cita AGENDADA y queda un evento CITA_AGENDADA en la misma transacción", async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const programadaPara = enUnaHora();

    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara,
      modalidad: "VIRTUAL",
    });

    expect(cita.estado).toBe("AGENDADA");
    expect(cita.recordatorioEnviado).toBe(false);
    expect(cita.usuarioId).toBe(asesor.id);

    const evento = await prisma.leadEvento.findFirst({
      where: { leadId: lead.id, tipo: "CITA_AGENDADA" },
    });
    expect(evento).not.toBeNull();
    expect(evento?.detalle).toMatchObject({ citaId: cita.id, usuarioResponsableId: asesor.id });
  });

  it("un administrador puede agendar la cita a nombre de otro usuario explícito", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const vendedor = await crearUsuario("VENDEDOR");
    const lead = await crearLead({ etapa: "CITA" });

    const cita = await scheduleCita(comoActor(admin), lead.id, {
      programadaPara: enUnaHora(),
      modalidad: "PRESENCIAL",
      usuarioId: vendedor.id,
    });

    expect(cita.usuarioId).toBe(vendedor.id);
  });

  it("un asesor no puede agendar una cita a nombre de otro usuario (solo Admin/Supervisor)", async () => {
    const asesor = await crearUsuario("ASESOR");
    const otroAsesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });

    await expect(
      scheduleCita(comoActor(asesor), lead.id, {
        programadaPara: enUnaHora(),
        modalidad: "TELEFONICA",
        usuarioId: otroAsesor.id,
      }),
    ).rejects.toMatchObject({ code: "permiso_denegado" });
  });

  it("rechaza una cita en el pasado (checklist M7)", async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });

    await expect(
      scheduleCita(comoActor(asesor), lead.id, {
        programadaPara: new Date(Date.now() - 60_000),
        modalidad: "VIRTUAL",
      }),
    ).rejects.toMatchObject({ code: "cita_en_pasado" });
  });

  it("rechaza agendar una cita en un lead cerrado (VENTA)", async () => {
    const vendedor = await crearUsuario("VENDEDOR");
    const lead = await crearLead({ etapa: "VENTA", vendedorId: vendedor.id });

    await expect(
      scheduleCita(comoActor(vendedor), lead.id, {
        programadaPara: enUnaHora(),
        modalidad: "VIRTUAL",
      }),
    ).rejects.toMatchObject({ code: "lead_cerrado" });
  });

  it("un usuario ajeno al lead (sin ser Admin/Supervisor) no puede agendar", async () => {
    const asesorTitular = await crearUsuario("ASESOR");
    const asesorAjeno = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesorTitular.id });

    await expect(
      scheduleCita(comoActor(asesorAjeno), lead.id, {
        programadaPara: enUnaHora(),
        modalidad: "VIRTUAL",
      }),
    ).rejects.toMatchObject({ code: "permiso_denegado" });
  });

  it("404 lead_no_encontrado cuando el lead no existe", async () => {
    const asesor = await crearUsuario("ASESOR");

    await expect(
      scheduleCita(comoActor(asesor), "00000000-0000-0000-0000-000000000000", {
        programadaPara: enUnaHora(),
        modalidad: "VIRTUAL",
      }),
    ).rejects.toMatchObject({ code: "lead_no_encontrado" });
  });
});

describe("citas.service — listCitasByLead / getCitaById (D4: autorización por recurso, canRead)", () => {
  it("el responsable operativo lista las citas de su lead", async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    await scheduleCita(comoActor(asesor), lead.id, { programadaPara: enUnaHora(), modalidad: "VIRTUAL" });

    const citas = await listCitasByLead(comoActor(asesor), lead.id);
    expect(citas).toHaveLength(1);
  });

  it("un asesor ajeno no puede listar las citas de un lead que no es suyo", async () => {
    const asesorTitular = await crearUsuario("ASESOR");
    const asesorAjeno = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesorTitular.id });

    await expect(listCitasByLead(comoActor(asesorAjeno), lead.id)).rejects.toMatchObject({
      code: "permiso_denegado",
    });
  });

  it("getCitaById devuelve 404 cita_no_encontrada cuando la cita no existe", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");

    await expect(
      getCitaById(comoActor(admin), "00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({ code: "cita_no_encontrada" });
  });
});

describe("citas.service — cancelCita (máquina de estados)", () => {
  it("cancela una cita AGENDADA", async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara: enUnaHora(),
      modalidad: "VIRTUAL",
    });

    const cancelada = await cancelCita(comoActor(asesor), cita.id);
    expect(cancelada.estado).toBe("CANCELADA");
  });

  it("rechaza cancelar una cita que ya está cancelada (409 cita_no_cancelable)", async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara: enUnaHora(),
      modalidad: "VIRTUAL",
    });
    await cancelCita(comoActor(asesor), cita.id);

    await expect(cancelCita(comoActor(asesor), cita.id)).rejects.toMatchObject({
      code: "cita_no_cancelable",
    });
  });
});
