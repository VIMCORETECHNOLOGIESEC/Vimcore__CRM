import { afterAll, describe, expect, it } from "vitest";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import {
  cancelCita,
  getCitaById,
  listCitasByLead,
  marcarResultadoCita,
  rescheduleCita,
  scheduleCita,
} from "../src/services/citas.service.js";
import type { UsuarioAcceso } from "../src/services/leads.access.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

let contador = 0;

async function crearUsuario(
  rol: "ADMINISTRADOR" | "SUPERVISOR" | "SUPERVISOR_HOLDING" | "SUPER_ADMIN" | "ASESOR" | "VENDEDOR",
): Promise<{
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

// Bloque C (D2): Admin/Supervisor holding-wide (empresaId null), Asesor/
// Vendedor acotados a la empresa bootstrap (misma empresa que `crearLead`
// de abajo) — este archivo no ejercita aislamiento cross-empresa.
// Bloque F (aditivo): SUPERVISOR_HOLDING/SUPER_ADMIN son holding-wide con el
// mismo criterio que ADMINISTRADOR/SUPERVISOR (empresaId null, sin Membresia).
const ROLES_HOLDING_WIDE: readonly UsuarioAcceso["rol"][] = [
  "ADMINISTRADOR",
  "SUPERVISOR",
  "SUPERVISOR_HOLDING",
  "SUPER_ADMIN",
];

function comoActor(usuario: { id: string; rol: UsuarioAcceso["rol"] }): UsuarioAcceso {
  const empresaId = ROLES_HOLDING_WIDE.includes(usuario.rol) ? null : EMPRESA_BOOTSTRAP_ID;
  return { id: usuario.id, rol: usuario.rol, empresaId };
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
  const lead = await testAdminPrisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: overrides.etapa ?? "CONTACTADO",
      asesorId: overrides.asesorId ?? null,
      vendedorId: overrides.vendedorId ?? null,
      ingresadoEn: new Date(),
      empresaId: EMPRESA_BOOTSTRAP_ID,
    },
  });
  return { id: lead.id };
}

function enUnaHora(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

/**
 * Bloque C (Etapa 3, batch 3 discovery, D2 gap closure): `citas.service.ts`
 * no acepta un `client` swappable — se llama DIRECTO (sin HTTP) en todo este
 * archivo, y toca `citas`/`leads`/`lead_eventos` (RLS). Todos los fixtures
 * viven en la empresa bootstrap.
 */
function conContexto<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ empresaId: EMPRESA_BOOTSTRAP_ID }, fn);
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("citas.service — scheduleCita (M7, CRUD + evento CITA_AGENDADA)", () => {
  it("el responsable operativo agenda una cita AGENDADA y queda un evento CITA_AGENDADA en la misma transacción", () =>
    conContexto(async () => {
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
  }));

  it("un administrador puede agendar la cita a nombre de otro usuario explícito", () =>
    conContexto(async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const vendedor = await crearUsuario("VENDEDOR");
    const lead = await crearLead({ etapa: "CITA" });

    const cita = await scheduleCita(comoActor(admin), lead.id, {
      programadaPara: enUnaHora(),
      modalidad: "PRESENCIAL",
      usuarioId: vendedor.id,
    });

    expect(cita.usuarioId).toBe(vendedor.id);
  }));

  /**
   * Bloque F: `canEdit` (`leads.access.ts`) EXCLUYE a propósito el bypass
   * holding-wide (ver su propio comentario "Bloque F" ahí, no se toca) —
   * SUPERVISOR_HOLDING/SUPER_ADMIN solo pasan `canEdit` por titularidad, igual
   * que un ASESOR. Por eso el lead se crea con `asesorId` = el propio actor
   * (a diferencia del test de ADMINISTRADOR de arriba, que no lo necesita
   * porque su bypass SÍ vive en `canEdit`). Lo que este test aísla es el
   * `ROLES_ACCESO_TOTAL` LOCAL de `citas.service.ts::resolveResponsable` —
   * exactamente el fix de esta tarea.
   */
  it("un SUPERVISOR_HOLDING (titular del lead) puede agendar la cita a nombre de otro usuario explícito (Bloque F, bypass en resolveResponsable)", () =>
    conContexto(async () => {
    const supervisorHolding = await crearUsuario("SUPERVISOR_HOLDING");
    const vendedor = await crearUsuario("VENDEDOR");
    const lead = await crearLead({ etapa: "CITA", asesorId: supervisorHolding.id });

    const cita = await scheduleCita(comoActor(supervisorHolding), lead.id, {
      programadaPara: enUnaHora(),
      modalidad: "PRESENCIAL",
      usuarioId: vendedor.id,
    });

    expect(cita.usuarioId).toBe(vendedor.id);
  }));

  it("un SUPER_ADMIN (titular del lead) puede agendar la cita a nombre de otro usuario explícito (triangulación: segundo rol holding-wide distinto)", () =>
    conContexto(async () => {
    const superAdmin = await crearUsuario("SUPER_ADMIN");
    const vendedor = await crearUsuario("VENDEDOR");
    const lead = await crearLead({ etapa: "CITA", asesorId: superAdmin.id });

    const cita = await scheduleCita(comoActor(superAdmin), lead.id, {
      programadaPara: enUnaHora(),
      modalidad: "PRESENCIAL",
      usuarioId: vendedor.id,
    });

    expect(cita.usuarioId).toBe(vendedor.id);
  }));

  it("un asesor no puede agendar una cita a nombre de otro usuario (solo Admin/Supervisor)", () =>
    conContexto(async () => {
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
  }));

  it("rechaza una cita en el pasado (checklist M7)", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });

    await expect(
      scheduleCita(comoActor(asesor), lead.id, {
        programadaPara: new Date(Date.now() - 60_000),
        modalidad: "VIRTUAL",
      }),
    ).rejects.toMatchObject({ code: "cita_en_pasado" });
  }));

  it("rechaza agendar una cita en un lead cerrado (VENTA)", () =>
    conContexto(async () => {
    const vendedor = await crearUsuario("VENDEDOR");
    const lead = await crearLead({ etapa: "VENTA", vendedorId: vendedor.id });

    await expect(
      scheduleCita(comoActor(vendedor), lead.id, {
        programadaPara: enUnaHora(),
        modalidad: "VIRTUAL",
      }),
    ).rejects.toMatchObject({ code: "lead_cerrado" });
  }));

  it("un usuario ajeno al lead (sin ser Admin/Supervisor) no puede agendar", () =>
    conContexto(async () => {
    const asesorTitular = await crearUsuario("ASESOR");
    const asesorAjeno = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesorTitular.id });

    await expect(
      scheduleCita(comoActor(asesorAjeno), lead.id, {
        programadaPara: enUnaHora(),
        modalidad: "VIRTUAL",
      }),
    ).rejects.toMatchObject({ code: "permiso_denegado" });
  }));

  it("404 lead_no_encontrado cuando el lead no existe", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");

    await expect(
      scheduleCita(comoActor(asesor), "00000000-0000-0000-0000-000000000000", {
        programadaPara: enUnaHora(),
        modalidad: "VIRTUAL",
      }),
    ).rejects.toMatchObject({ code: "lead_no_encontrado" });
  }));
});

describe("citas.service — listCitasByLead / getCitaById (D4: autorización por recurso, canRead)", () => {
  it("el responsable operativo lista las citas de su lead", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    await scheduleCita(comoActor(asesor), lead.id, { programadaPara: enUnaHora(), modalidad: "VIRTUAL" });

    const citas = await listCitasByLead(comoActor(asesor), lead.id);
    expect(citas).toHaveLength(1);
  }));

  it("un asesor ajeno no puede listar las citas de un lead que no es suyo", () =>
    conContexto(async () => {
    const asesorTitular = await crearUsuario("ASESOR");
    const asesorAjeno = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesorTitular.id });

    await expect(listCitasByLead(comoActor(asesorAjeno), lead.id)).rejects.toMatchObject({
      code: "permiso_denegado",
    });
  }));

  it("getCitaById devuelve 404 cita_no_encontrada cuando la cita no existe", () =>
    conContexto(async () => {
    const admin = await crearUsuario("ADMINISTRADOR");

    await expect(
      getCitaById(comoActor(admin), "00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({ code: "cita_no_encontrada" });
  }));
});

describe("citas.service — cancelCita (máquina de estados)", () => {
  it("cancela una cita AGENDADA", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara: enUnaHora(),
      modalidad: "VIRTUAL",
    });

    const cancelada = await cancelCita(comoActor(asesor), cita.id);
    expect(cancelada.estado).toBe("CANCELADA");
  }));

  it("rechaza cancelar una cita que ya está cancelada (409 cita_no_cancelable)", () =>
    conContexto(async () => {
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
  }));
});

describe("citas.service — rescheduleCita (M7, checklist: reprogramación con registro de evento)", () => {
  it("reprograma: estado vuelve a AGENDADA con la nueva fecha, resetea recordatorioEnviado y escribe CITA_REPROGRAMADA", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const original = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara: enUnaHora(),
      modalidad: "VIRTUAL",
    });
    // Simula que ya se había enviado el recordatorio de la fecha original.
    await testAdminPrisma.cita.update({ where: { id: original.id }, data: { recordatorioEnviado: true } });

    const nuevaFecha = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const reprogramada = await rescheduleCita(comoActor(asesor), original.id, {
      programadaPara: nuevaFecha,
    });

    expect(reprogramada.estado).toBe("AGENDADA");
    expect(reprogramada.programadaPara.getTime()).toBe(nuevaFecha.getTime());
    expect(reprogramada.recordatorioEnviado).toBe(false);

    const evento = await prisma.leadEvento.findFirst({
      where: { leadId: lead.id, tipo: "CITA_REPROGRAMADA" },
    });
    expect(evento).not.toBeNull();
    expect(evento?.detalle).toMatchObject({ citaId: original.id });
  }));

  it("dos reprogramaciones sucesivas producen dos eventos CITA_REPROGRAMADA distintos", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara: enUnaHora(),
      modalidad: "VIRTUAL",
    });

    await rescheduleCita(comoActor(asesor), cita.id, {
      programadaPara: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });
    await rescheduleCita(comoActor(asesor), cita.id, {
      programadaPara: new Date(Date.now() + 3 * 60 * 60 * 1000),
    });

    const eventos = await prisma.leadEvento.findMany({
      where: { leadId: lead.id, tipo: "CITA_REPROGRAMADA" },
    });
    expect(eventos).toHaveLength(2);
  }));

  it("rechaza reprogramar a una fecha pasada", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara: enUnaHora(),
      modalidad: "VIRTUAL",
    });

    await expect(
      rescheduleCita(comoActor(asesor), cita.id, { programadaPara: new Date(Date.now() - 60_000) }),
    ).rejects.toMatchObject({ code: "cita_en_pasado" });
  }));

  it("rechaza reprogramar una cita ya cancelada (409 cita_no_reprogramable)", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara: enUnaHora(),
      modalidad: "VIRTUAL",
    });
    await cancelCita(comoActor(asesor), cita.id);

    await expect(
      rescheduleCita(comoActor(asesor), cita.id, { programadaPara: enUnaHora() }),
    ).rejects.toMatchObject({ code: "cita_no_reprogramable" });
  }));
});

describe("citas.service — marcarResultadoCita (M7, checklist: estados de cita, sin duplicar el formulario de etapa)", () => {
  it("marca CUMPLIDA una cita AGENDADA", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara: enUnaHora(),
      modalidad: "VIRTUAL",
    });

    const resultado = await marcarResultadoCita(comoActor(asesor), cita.id, { estado: "CUMPLIDA" });
    expect(resultado.estado).toBe("CUMPLIDA");
  }));

  it("marca NO_ASISTIO una cita AGENDADA (segundo caso: triangulación del primero)", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara: enUnaHora(),
      modalidad: "VIRTUAL",
    });

    const resultado = await marcarResultadoCita(comoActor(asesor), cita.id, { estado: "NO_ASISTIO" });
    expect(resultado.estado).toBe("NO_ASISTIO");
  }));

  it("no mueve leads.etapa ni escribe respuestas_formulario — es un registro asociado, no reemplaza el flujo de etapa", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "CITA" });
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara: enUnaHora(),
      modalidad: "VIRTUAL",
    });

    await marcarResultadoCita(comoActor(asesor), cita.id, { estado: "CUMPLIDA" });

    const leadTrasMarcar = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(leadTrasMarcar.etapa).toBe("CITA");
    const respuestas = await prisma.respuestaFormulario.count({ where: { leadId: lead.id } });
    expect(respuestas).toBe(0);
  }));

  it("rechaza marcar el resultado de una cita ya cancelada (409 cita_no_editable)", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara: enUnaHora(),
      modalidad: "VIRTUAL",
    });
    await cancelCita(comoActor(asesor), cita.id);

    await expect(
      marcarResultadoCita(comoActor(asesor), cita.id, { estado: "CUMPLIDA" }),
    ).rejects.toMatchObject({ code: "cita_no_editable" });
  }));
});
