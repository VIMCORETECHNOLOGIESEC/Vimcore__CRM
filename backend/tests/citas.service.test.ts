import { afterAll, describe, expect, it } from "vitest";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import {
  cancelCita,
  getCitaById,
  listCitas,
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

/** Vista de calendario (feature aditiva post-M7): duración mínima válida (1h exacta) a partir de un inicio dado. */
function finUnaHoraDespues(inicio: Date): Date {
  return new Date(inicio.getTime() + 60 * 60 * 1000);
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
      finalizaEn: finUnaHoraDespues(programadaPara),
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
    const programadaPara = enUnaHora();

    const cita = await scheduleCita(comoActor(admin), lead.id, {
      programadaPara,
      finalizaEn: finUnaHoraDespues(programadaPara),
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
    const programadaPara = enUnaHora();

    const cita = await scheduleCita(comoActor(supervisorHolding), lead.id, {
      programadaPara,
      finalizaEn: finUnaHoraDespues(programadaPara),
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
    const programadaPara = enUnaHora();

    const cita = await scheduleCita(comoActor(superAdmin), lead.id, {
      programadaPara,
      finalizaEn: finUnaHoraDespues(programadaPara),
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
    const programadaPara = enUnaHora();

    await expect(
      scheduleCita(comoActor(asesor), lead.id, {
        programadaPara,
        finalizaEn: finUnaHoraDespues(programadaPara),
        modalidad: "TELEFONICA",
        usuarioId: otroAsesor.id,
      }),
    ).rejects.toMatchObject({ code: "permiso_denegado" });
  }));

  it("rechaza una cita en el pasado (checklist M7)", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const programadaPara = new Date(Date.now() - 60_000);

    await expect(
      scheduleCita(comoActor(asesor), lead.id, {
        programadaPara,
        finalizaEn: finUnaHoraDespues(programadaPara),
        modalidad: "VIRTUAL",
      }),
    ).rejects.toMatchObject({ code: "cita_en_pasado" });
  }));

  it("rechaza agendar una cita en un lead cerrado (VENTA)", () =>
    conContexto(async () => {
    const vendedor = await crearUsuario("VENDEDOR");
    const lead = await crearLead({ etapa: "VENTA", vendedorId: vendedor.id });
    const programadaPara = enUnaHora();

    await expect(
      scheduleCita(comoActor(vendedor), lead.id, {
        programadaPara,
        finalizaEn: finUnaHoraDespues(programadaPara),
        modalidad: "VIRTUAL",
      }),
    ).rejects.toMatchObject({ code: "lead_cerrado" });
  }));

  it("un usuario ajeno al lead (sin ser Admin/Supervisor) no puede agendar", () =>
    conContexto(async () => {
    const asesorTitular = await crearUsuario("ASESOR");
    const asesorAjeno = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesorTitular.id });
    const programadaPara = enUnaHora();

    await expect(
      scheduleCita(comoActor(asesorAjeno), lead.id, {
        programadaPara,
        finalizaEn: finUnaHoraDespues(programadaPara),
        modalidad: "VIRTUAL",
      }),
    ).rejects.toMatchObject({ code: "permiso_denegado" });
  }));

  it("404 lead_no_encontrado cuando el lead no existe", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const programadaPara = enUnaHora();

    await expect(
      scheduleCita(comoActor(asesor), "00000000-0000-0000-0000-000000000000", {
        programadaPara,
        finalizaEn: finUnaHoraDespues(programadaPara),
        modalidad: "VIRTUAL",
      }),
    ).rejects.toMatchObject({ code: "lead_no_encontrado" });
  }));

  /**
   * Vista de calendario (feature aditiva post-M7): `EXCLUDE USING gist`
   * (`citas_no_solapamiento_por_asesor`, `migration.sql`) traducido a 409 por
   * `citas.service.ts::traducirConflictoDeHorario`. Mismo `usuarioId`
   * (responsable), horarios que se cruzan a mitad de camino (ni idénticos ni
   * anidados, el caso general de "se pisan").
   */
  it("rechaza (409 cita_horario_ocupado) agendar una segunda cita que se solapa con otra AGENDADA del mismo responsable", () =>
    conContexto(async () => {
      const asesor = await crearUsuario("ASESOR");
      const lead1 = await crearLead({ asesorId: asesor.id });
      const lead2 = await crearLead({ asesorId: asesor.id });
      const inicio = enUnaHora();

      await scheduleCita(comoActor(asesor), lead1.id, {
        programadaPara: inicio,
        finalizaEn: new Date(inicio.getTime() + 2 * 60 * 60 * 1000),
        modalidad: "VIRTUAL",
      });

      const inicioSolapado = new Date(inicio.getTime() + 30 * 60 * 1000);
      await expect(
        scheduleCita(comoActor(asesor), lead2.id, {
          programadaPara: inicioSolapado,
          finalizaEn: finUnaHoraDespues(inicioSolapado),
          modalidad: "VIRTUAL",
        }),
      ).rejects.toMatchObject({ code: "cita_horario_ocupado" });
    }));

  it("dos citas en el mismo horario para responsables DISTINTOS no chocan (triangulación: el EXCLUDE es por usuario_id, no global)", () =>
    conContexto(async () => {
      const asesorUno = await crearUsuario("ASESOR");
      const asesorDos = await crearUsuario("ASESOR");
      const lead1 = await crearLead({ asesorId: asesorUno.id });
      const lead2 = await crearLead({ asesorId: asesorDos.id });
      const inicio = enUnaHora();

      await scheduleCita(comoActor(asesorUno), lead1.id, {
        programadaPara: inicio,
        finalizaEn: finUnaHoraDespues(inicio),
        modalidad: "VIRTUAL",
      });

      const citaDos = await scheduleCita(comoActor(asesorDos), lead2.id, {
        programadaPara: inicio,
        finalizaEn: finUnaHoraDespues(inicio),
        modalidad: "VIRTUAL",
      });

      expect(citaDos.estado).toBe("AGENDADA");
    }));

  it("una cita CANCELADA no bloquea el mismo horario para una cita nueva del mismo responsable (el EXCLUDE solo aplica a AGENDADA)", () =>
    conContexto(async () => {
      const asesor = await crearUsuario("ASESOR");
      const lead1 = await crearLead({ asesorId: asesor.id });
      const lead2 = await crearLead({ asesorId: asesor.id });
      const inicio = enUnaHora();

      const primera = await scheduleCita(comoActor(asesor), lead1.id, {
        programadaPara: inicio,
        finalizaEn: finUnaHoraDespues(inicio),
        modalidad: "VIRTUAL",
      });
      await cancelCita(comoActor(asesor), primera.id);

      const segunda = await scheduleCita(comoActor(asesor), lead2.id, {
        programadaPara: inicio,
        finalizaEn: finUnaHoraDespues(inicio),
        modalidad: "VIRTUAL",
      });

      expect(segunda.estado).toBe("AGENDADA");
    }));
});

describe("citas.service — scheduleCita (duración mínima, defensa en profundidad de BD)", () => {
  /**
   * `citas.schema.ts` ya rechaza esto en el borde (`superRefine`) -- este
   * test llama al REPOSITORIO directo (no `scheduleCita`), a propósito, para
   * probar el `CHECK citas_duracion_minima` de la BD en sí mismo, sin pasar
   * por Zod. `citas.service.ts::traducirConflictoDeHorario` NO traduce este
   * error a un `AppError` de dominio (documentado explícito en su propio
   * comentario) -- este test confirma que la BD sigue rechazando la fila
   * incluso si algún llamador futuro se saltara la validación de Zod.
   */
  it("el CHECK citas_duracion_minima de la BD rechaza una duración menor a 1h aunque se bypasee Zod", () =>
    conContexto(async () => {
      const asesor = await crearUsuario("ASESOR");
      const lead = await crearLead({ asesorId: asesor.id });
      const inicio = enUnaHora();

      await expect(
        testAdminPrisma.cita.create({
          data: {
            leadId: lead.id,
            empresaId: EMPRESA_BOOTSTRAP_ID,
            usuarioId: asesor.id,
            programadaPara: inicio,
            finalizaEn: new Date(inicio.getTime() + 10 * 60 * 1000),
            modalidad: "VIRTUAL",
          },
        }),
      ).rejects.toThrow();
    }));
});

describe("citas.service — listCitasByLead / getCitaById (D4: autorización por recurso, canRead)", () => {
  it("el responsable operativo lista las citas de su lead", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const programadaPara = enUnaHora();
    await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara,
      finalizaEn: finUnaHoraDespues(programadaPara),
      modalidad: "VIRTUAL",
    });

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
    const programadaPara = enUnaHora();
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara,
      finalizaEn: finUnaHoraDespues(programadaPara),
      modalidad: "VIRTUAL",
    });

    const cancelada = await cancelCita(comoActor(asesor), cita.id);
    expect(cancelada.estado).toBe("CANCELADA");
  }));

  it("rechaza cancelar una cita que ya está cancelada (409 cita_no_cancelable)", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const programadaPara = enUnaHora();
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara,
      finalizaEn: finUnaHoraDespues(programadaPara),
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
    const programadaPara = enUnaHora();
    const original = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara,
      finalizaEn: finUnaHoraDespues(programadaPara),
      modalidad: "VIRTUAL",
    });
    // Simula que ya se había enviado el recordatorio de la fecha original.
    await testAdminPrisma.cita.update({ where: { id: original.id }, data: { recordatorioEnviado: true } });

    const nuevaFecha = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const reprogramada = await rescheduleCita(comoActor(asesor), original.id, {
      programadaPara: nuevaFecha,
      finalizaEn: finUnaHoraDespues(nuevaFecha),
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
    const programadaPara = enUnaHora();
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara,
      finalizaEn: finUnaHoraDespues(programadaPara),
      modalidad: "VIRTUAL",
    });

    const primeraNuevaFecha = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await rescheduleCita(comoActor(asesor), cita.id, {
      programadaPara: primeraNuevaFecha,
      finalizaEn: finUnaHoraDespues(primeraNuevaFecha),
    });
    const segundaNuevaFecha = new Date(Date.now() + 3 * 60 * 60 * 1000);
    await rescheduleCita(comoActor(asesor), cita.id, {
      programadaPara: segundaNuevaFecha,
      finalizaEn: finUnaHoraDespues(segundaNuevaFecha),
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
    const programadaPara = enUnaHora();
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara,
      finalizaEn: finUnaHoraDespues(programadaPara),
      modalidad: "VIRTUAL",
    });

    const fechaPasada = new Date(Date.now() - 60_000);
    await expect(
      rescheduleCita(comoActor(asesor), cita.id, {
        programadaPara: fechaPasada,
        finalizaEn: finUnaHoraDespues(fechaPasada),
      }),
    ).rejects.toMatchObject({ code: "cita_en_pasado" });
  }));

  it("rechaza reprogramar una cita ya cancelada (409 cita_no_reprogramable)", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const programadaPara = enUnaHora();
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara,
      finalizaEn: finUnaHoraDespues(programadaPara),
      modalidad: "VIRTUAL",
    });
    await cancelCita(comoActor(asesor), cita.id);

    const nuevaFecha = enUnaHora();
    await expect(
      rescheduleCita(comoActor(asesor), cita.id, {
        programadaPara: nuevaFecha,
        finalizaEn: finUnaHoraDespues(nuevaFecha),
      }),
    ).rejects.toMatchObject({ code: "cita_no_reprogramable" });
  }));

  /**
   * Vista de calendario (feature aditiva post-M7): reprogramar también pasa
   * por el `EXCLUDE` -- mismo `traducirConflictoDeHorario` que `scheduleCita`.
   */
  it("rechaza (409 cita_horario_ocupado) reprogramar hacia un horario ya ocupado por otra cita AGENDADA del mismo responsable", () =>
    conContexto(async () => {
      const asesor = await crearUsuario("ASESOR");
      const leadOcupante = await crearLead({ asesorId: asesor.id });
      const leadAReprogramar = await crearLead({ asesorId: asesor.id });
      const inicioOcupado = new Date(Date.now() + 5 * 60 * 60 * 1000);

      await scheduleCita(comoActor(asesor), leadOcupante.id, {
        programadaPara: inicioOcupado,
        finalizaEn: finUnaHoraDespues(inicioOcupado),
        modalidad: "VIRTUAL",
      });

      const programadaPara = enUnaHora();
      const citaAReprogramar = await scheduleCita(comoActor(asesor), leadAReprogramar.id, {
        programadaPara,
        finalizaEn: finUnaHoraDespues(programadaPara),
        modalidad: "VIRTUAL",
      });

      await expect(
        rescheduleCita(comoActor(asesor), citaAReprogramar.id, {
          programadaPara: inicioOcupado,
          finalizaEn: finUnaHoraDespues(inicioOcupado),
        }),
      ).rejects.toMatchObject({ code: "cita_horario_ocupado" });
    }));
});

describe("citas.service — marcarResultadoCita (M7, checklist: estados de cita, sin duplicar el formulario de etapa)", () => {
  it("marca CUMPLIDA una cita AGENDADA", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const programadaPara = enUnaHora();
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara,
      finalizaEn: finUnaHoraDespues(programadaPara),
      modalidad: "VIRTUAL",
    });

    const resultado = await marcarResultadoCita(comoActor(asesor), cita.id, { estado: "CUMPLIDA" });
    expect(resultado.estado).toBe("CUMPLIDA");
  }));

  it("marca NO_ASISTIO una cita AGENDADA (segundo caso: triangulación del primero)", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id });
    const programadaPara = enUnaHora();
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara,
      finalizaEn: finUnaHoraDespues(programadaPara),
      modalidad: "VIRTUAL",
    });

    const resultado = await marcarResultadoCita(comoActor(asesor), cita.id, { estado: "NO_ASISTIO" });
    expect(resultado.estado).toBe("NO_ASISTIO");
  }));

  it("no mueve leads.etapa ni escribe respuestas_formulario — es un registro asociado, no reemplaza el flujo de etapa", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    const lead = await crearLead({ asesorId: asesor.id, etapa: "CITA" });
    const programadaPara = enUnaHora();
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara,
      finalizaEn: finUnaHoraDespues(programadaPara),
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
    const programadaPara = enUnaHora();
    const cita = await scheduleCita(comoActor(asesor), lead.id, {
      programadaPara,
      finalizaEn: finUnaHoraDespues(programadaPara),
      modalidad: "VIRTUAL",
    });
    await cancelCita(comoActor(asesor), cita.id);

    await expect(
      marcarResultadoCita(comoActor(asesor), cita.id, { estado: "CUMPLIDA" }),
    ).rejects.toMatchObject({ code: "cita_no_editable" });
  }));
});

describe("citas.service — listCitas (vista de calendario, feature aditiva post-M7)", () => {
  /** Rango generoso: cubre cualquier `programadaPara` fijado con `enUnaHora()`/horas relativas de este archivo. */
  function rangoAmplio(): { desde: Date; hasta: Date } {
    return { desde: new Date(Date.now() - 24 * 60 * 60 * 1000), hasta: new Date(Date.now() + 24 * 60 * 60 * 1000) };
  }

  it("un ASESOR solo ve sus propias citas, incluso si manda el asesorId de otro en el filtro", () =>
    conContexto(async () => {
      const asesorUno = await crearUsuario("ASESOR");
      const asesorDos = await crearUsuario("ASESOR");
      const lead1 = await crearLead({ asesorId: asesorUno.id });
      const lead2 = await crearLead({ asesorId: asesorDos.id });
      const programadaPara1 = enUnaHora();
      const programadaPara2 = enUnaHora();

      await scheduleCita(comoActor(asesorUno), lead1.id, {
        programadaPara: programadaPara1,
        finalizaEn: finUnaHoraDespues(programadaPara1),
        modalidad: "VIRTUAL",
      });
      await scheduleCita(comoActor(asesorDos), lead2.id, {
        programadaPara: programadaPara2,
        finalizaEn: finUnaHoraDespues(programadaPara2),
        modalidad: "VIRTUAL",
      });

      const citas = await listCitas(comoActor(asesorUno), { ...rangoAmplio(), asesorId: asesorDos.id });

      expect(citas).toHaveLength(1);
      expect(citas[0]?.usuarioId).toBe(asesorUno.id);
    }));

  it("un ADMINISTRADOR ve todas las citas de la empresa sin filtro de asesorId", () =>
    conContexto(async () => {
      const admin = await crearUsuario("ADMINISTRADOR");
      const asesorUno = await crearUsuario("ASESOR");
      const asesorDos = await crearUsuario("ASESOR");
      const lead1 = await crearLead({ asesorId: asesorUno.id });
      const lead2 = await crearLead({ asesorId: asesorDos.id });
      const programadaPara1 = enUnaHora();
      const programadaPara2 = enUnaHora();

      await scheduleCita(comoActor(asesorUno), lead1.id, {
        programadaPara: programadaPara1,
        finalizaEn: finUnaHoraDespues(programadaPara1),
        modalidad: "VIRTUAL",
      });
      await scheduleCita(comoActor(asesorDos), lead2.id, {
        programadaPara: programadaPara2,
        finalizaEn: finUnaHoraDespues(programadaPara2),
        modalidad: "VIRTUAL",
      });

      const citas = await listCitas(comoActor(admin), { ...rangoAmplio(), empresaId: EMPRESA_BOOTSTRAP_ID });

      const usuarioIds = citas.map((c) => c.usuarioId);
      expect(usuarioIds).toEqual(expect.arrayContaining([asesorUno.id, asesorDos.id]));
    }));

  it("un ADMINISTRADOR puede acotar el calendario a un asesorId puntual (triangulación: filtro opcional SÍ aplica para acceso total)", () =>
    conContexto(async () => {
      const admin = await crearUsuario("ADMINISTRADOR");
      const asesorUno = await crearUsuario("ASESOR");
      const asesorDos = await crearUsuario("ASESOR");
      const lead1 = await crearLead({ asesorId: asesorUno.id });
      const lead2 = await crearLead({ asesorId: asesorDos.id });
      const programadaPara1 = enUnaHora();
      const programadaPara2 = enUnaHora();

      await scheduleCita(comoActor(asesorUno), lead1.id, {
        programadaPara: programadaPara1,
        finalizaEn: finUnaHoraDespues(programadaPara1),
        modalidad: "VIRTUAL",
      });
      await scheduleCita(comoActor(asesorDos), lead2.id, {
        programadaPara: programadaPara2,
        finalizaEn: finUnaHoraDespues(programadaPara2),
        modalidad: "VIRTUAL",
      });

      const citas = await listCitas(comoActor(admin), {
        ...rangoAmplio(),
        empresaId: EMPRESA_BOOTSTRAP_ID,
        asesorId: asesorUno.id,
      });

      expect(citas).toHaveLength(1);
      expect(citas[0]?.usuarioId).toBe(asesorUno.id);
    }));

  it("incluye lead.cliente y usuario en el resultado, sin una segunda consulta", () =>
    conContexto(async () => {
      const asesor = await crearUsuario("ASESOR");
      const lead = await crearLead({ asesorId: asesor.id });
      const programadaPara = enUnaHora();
      await scheduleCita(comoActor(asesor), lead.id, {
        programadaPara,
        finalizaEn: finUnaHoraDespues(programadaPara),
        modalidad: "VIRTUAL",
      });

      const citas = await listCitas(comoActor(asesor), rangoAmplio());

      expect(citas).toHaveLength(1);
      expect(citas[0]?.lead.id).toBe(lead.id);
      expect(citas[0]?.usuario.id).toBe(asesor.id);
      expect(citas[0]?.usuario.nombre).toBeTruthy();
    }));

  it("un evento que empieza antes de `desde` y termina después no desaparece del calendario", () =>
    conContexto(async () => {
      const asesor = await crearUsuario("ASESOR");
      const lead = await crearLead({ asesorId: asesor.id });
      const inicio = new Date(Date.now() + 60 * 60 * 1000);
      const fin = new Date(inicio.getTime() + 3 * 60 * 60 * 1000);
      await scheduleCita(comoActor(asesor), lead.id, {
        programadaPara: inicio,
        finalizaEn: fin,
        modalidad: "VIRTUAL",
      });

      // Rango de calendario que cae DENTRO de la cita (empieza después de
      // que la cita ya arrancó, termina antes de que la cita termine).
      const desde = new Date(inicio.getTime() + 60 * 60 * 1000);
      const hasta = new Date(fin.getTime() - 60 * 60 * 1000);

      const citas = await listCitas(comoActor(asesor), { desde, hasta });
      expect(citas).toHaveLength(1);
    }));
});
