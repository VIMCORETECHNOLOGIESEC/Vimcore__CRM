import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eventBroker } from "../src/lib/event-broker.js";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import * as leadEventoRepository from "../src/repositories/lead-evento.repository.js";
import * as leadRepository from "../src/repositories/lead.repository.js";
import * as notificacionRepository from "../src/repositories/notificacion.repository.js";
import * as usuarioRepository from "../src/repositories/usuario.repository.js";
import {
  createEmpresaAdministrador,
  createUsuario,
  deactivateUsuario,
  findResponsables,
  findUsuarioById,
  findUsuarios,
} from "../src/services/usuarios.service.js";
import type { AuthenticatedUser } from "../src/types/authenticated-user.js";
import type { ListUsuariosQuery } from "../src/schemas/usuarios.schema.js";
import type { EtapaLead, RolUsuario } from "@prisma/client";

function queryUsuariosBase(overrides: Partial<ListUsuariosQuery> = {}): ListUsuariosQuery {
  return { pagina: 1, limite: 100, direccion: "asc", ...overrides };
}

const BOOTSTRAP_EMPRESA_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Fix (bug de seguridad, scope por empresa en `usuarios.service.ts`):
 * `deactivateUsuario` ahora exige el actor autenticado. Este archivo prueba
 * la baja lógica en sí (reasignación de cartera, SSE, atomicidad), no el
 * scope por empresa (cubierto en `tests/adversarial/http-cross-company.test.ts`)
 * -- un actor holding-wide preserva el comportamiento exacto previo a este
 * fix (`assertUsuarioEnAlcance` es un no-op cuando `empresaId === null`).
 */
const actorHoldingWide: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-0000000000aa",
  nombre: "Actor Holding-Wide (fixture de test)",
  correo: "actor-holding-wide@fixture.test",
  rol: "ADMINISTRADOR",
  sessionScope: "holding",
  empresaId: null,
};

/**
 * Fix (bug de seguridad, empresaId forzado por sesión — `createUsuario`/
 * `findResponsables`): actor company-scoped sintético, mismo criterio que
 * `bridges.service.test.ts` -- objeto `AuthenticatedUser` armado a mano
 * (sin HTTP/login real) es suficiente porque `resolveEmpresaId`/
 * `findResponsables` solo miran `actor.empresaId`/`actor.sessionScope`,
 * nunca releen la `Membresia` real de la BD.
 */
const actorCompanyScoped: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-0000000000cc",
  nombre: "Actor Company-Scoped (fixture de test)",
  correo: "actor-company-scoped@fixture.test",
  rol: "ADMINISTRADOR",
  sessionScope: "company",
  empresaId: BOOTSTRAP_EMPRESA_ID,
};

/**
 * Bloque C (Etapa 3, batch 3 discovery, D2 gap closure): `createUsuario`/
 * `deactivateUsuario` se llaman DIRECTO (sin HTTP) en todo este archivo —
 * ambas tocan `membresias`/`leads`/`lead_eventos` (RLS) sin `TenantContext`
 * si no se envuelven. Todos los fixtures de este archivo viven en la
 * empresa bootstrap, así que un contexto fijo a esa empresa es correcto acá
 * (a diferencia de `deduplicacion.service.test.ts`, que necesita
 * unrestricted por cruzar dos empresas en una misma prueba).
 */
function conContexto<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ empresaId: BOOTSTRAP_EMPRESA_ID }, fn);
}

/**
 * Fix (post-corrección, corrida real contra `.env.dev`): mismo criterio que
 * `deduplicacion.service.test.ts::sinRestriccion` -- necesario para
 * `findResponsables`/`findUsuarioById` en un escenario holding-wide que lee
 * DOS empresas distintas de BOOTSTRAP en la misma prueba: `conContexto`
 * pinea la RLS del cliente `prisma` normal a BOOTSTRAP, así que esas filas
 * serían físicamente invisibles sin importar el `actor` que reciba el
 * service.
 */
function sinRestriccion<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ empresaId: null }, fn);
}

let contador = 0;

async function crearCliente(): Promise<{ id: string }> {
  contador += 1;
  return prisma.cliente.create({
    data: { nombre: `Cliente baja usuario ${contador}`, telefonoValido: false },
  });
}

/**
 * Fix (bug real, `deactivateUsuario`/`POOL_BY_ROL` -- ver comentario de
 * `POOLS_DE_CARTERA` en `usuarios.service.ts`): el candidato de reemplazo
 * ahora se resuelve vía `Membresia` (`findActivosPorRolMembresia`), no vía
 * `Usuario.rol` legado -- un fixture `ASESOR`/`VENDEDOR` sin `Membresia`
 * activa ya no es un candidato válido. Mismo patrón que
 * `tests/asignacion.routes.test.ts::crearUsuarioConToken`: `VENDEDOR` legado
 * -> `Membresia(rol: ASESOR, habilitadoParaVenta: true)`, `ASESOR` legado ->
 * `Membresia(rol: ASESOR, habilitadoParaVenta: false)`. `ADMINISTRADOR`/
 * `SUPERVISOR` no reciben `Membresia` (mismo criterio que `createUsuario`
 * real -- están en `ROLES_ACCESO_TOTAL`).
 */
async function crearUsuario(rol: RolUsuario, activo = true): Promise<{ id: string; rol: RolUsuario }> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario baja ${contador}`,
      correo: `usuario-baja-${contador}@integracion.test`,
      passwordHash: "hash-no-usado",
      rol,
      activo,
    },
  });
  if (rol === "ASESOR" || rol === "VENDEDOR") {
    await testAdminPrisma.membresia.create({
      data: {
        usuarioId: usuario.id,
        empresaId: BOOTSTRAP_EMPRESA_ID,
        rol: "ASESOR",
        habilitadoParaVenta: rol === "VENDEDOR",
        activa: activo,
      },
    });
  }
  return { id: usuario.id, rol: usuario.rol };
}

async function crearLead(data: {
  asesorId?: string;
  vendedorId?: string;
  etapa?: EtapaLead;
}): Promise<{ id: string }> {
  const cliente = await crearCliente();
  return testAdminPrisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: data.etapa ?? "NUEVO",
      ingresadoEn: new Date(),
      asesorId: data.asesorId,
      vendedorId: data.vendedorId,
      empresaId: BOOTSTRAP_EMPRESA_ID,
    },
  });
}

/**
 * Aislamiento (mismo criterio que `asignacion.service.test.ts`): la suite
 * corre archivos de prueba concurrentes contra la misma BD real.
 *
 * Fix (mismo hueco que `asignacion.routes.test.ts::desactivarPoolAsesores`,
 * documentado ahí): desde que `deactivateUsuario` resuelve candidatos vía
 * `Membresia` (`POOLS_DE_CARTERA`, `usuarios.service.ts`), `RolMembresia` no
 * distingue `ASESOR`/`VENDEDOR` -- ambos son `Membresia(rol: ASESOR)`, solo
 * `habilitadoParaVenta` los distingue. Desactivar solo por `Usuario.rol`
 * legado (como antes) YA NO aísla: un fixture `VENDEDOR` de un test previo
 * (Membresia activa, `usuario.activo` todavía true) sigue siendo un candidato
 * `ASESOR` válido aunque `updateMany({ where: { rol: "ASESOR" } })` no lo
 * toque. Cortar también por `Membresia` (cualquiera de los dos rol pedidos)
 * cierra el hueco para ambas literales.
 */
async function desactivarTodos(rol: RolUsuario): Promise<void> {
  await prisma.usuario.updateMany({ where: { rol }, data: { activo: false } });
  if (rol === "ASESOR" || rol === "VENDEDOR") {
    await testAdminPrisma.membresia.updateMany({
      where: { empresaId: BOOTSTRAP_EMPRESA_ID, rol: "ASESOR" },
      data: { activa: false },
    });
  }
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("usuarios.service — createUsuario (Bloque C follow-up, D2 gap closure: Membresia bootstrap at user creation)", () => {
  it("ASESOR: crea el Usuario y una Membresia activa (rol=ASESOR, habilitadoParaVenta=false) en la misma transacción", () =>
    conContexto(async () => {
      const creado = await createUsuario(actorHoldingWide, {
        nombre: "Asesor Nuevo",
        correo: `asesor-nuevo-${randomUUID()}@integracion.test`,
        password: "clave-asesor-123456",
        rol: "ASESOR",
        empresaId: BOOTSTRAP_EMPRESA_ID,
      });

      const membresia = await testAdminPrisma.membresia.findFirst({ where: { usuarioId: creado.id } });
      expect(membresia).toMatchObject({
        empresaId: BOOTSTRAP_EMPRESA_ID,
        rol: "ASESOR",
        habilitadoParaVenta: false,
        activa: true,
      });
    }));

  it("VENDEDOR legado: crea el Usuario y una Membresia(rol=ASESOR, habilitadoParaVenta=true)", () =>
    conContexto(async () => {
      const creado = await createUsuario(actorHoldingWide, {
        nombre: "Vendedor Nuevo",
        correo: `vendedor-nuevo-${randomUUID()}@integracion.test`,
        password: "clave-vendedor-123456",
        rol: "VENDEDOR",
        empresaId: BOOTSTRAP_EMPRESA_ID,
      });

      const membresia = await testAdminPrisma.membresia.findFirst({ where: { usuarioId: creado.id } });
      expect(membresia).toMatchObject({
        empresaId: BOOTSTRAP_EMPRESA_ID,
        rol: "ASESOR",
        habilitadoParaVenta: true,
        activa: true,
      });
    }));

  it("ADMINISTRADOR: crea el Usuario SIN ninguna Membresia (holding-wide incondicional, D2)", () =>
    conContexto(async () => {
      const creado = await createUsuario(actorHoldingWide, {
        nombre: "Admin Nuevo",
        correo: `admin-nuevo-${randomUUID()}@integracion.test`,
        password: "clave-admin-123456",
        rol: "ADMINISTRADOR",
      });

      const membresias = await testAdminPrisma.membresia.findMany({ where: { usuarioId: creado.id } });
      expect(membresias).toEqual([]);
    }));

  it("SUPERVISOR: crea el Usuario SIN ninguna Membresia (holding-wide incondicional, D2)", () =>
    conContexto(async () => {
      const creado = await createUsuario(actorHoldingWide, {
        nombre: "Supervisor Nuevo",
        correo: `supervisor-nuevo-${randomUUID()}@integracion.test`,
        password: "clave-supervisor-123456",
        rol: "SUPERVISOR",
      });

      const membresias = await testAdminPrisma.membresia.findMany({ where: { usuarioId: creado.id } });
      expect(membresias).toEqual([]);
    }));

  /**
   * Bloque F (fix de bug real): antes de este fix, `SUPERVISOR_HOLDING`/
   * `SUPER_ADMIN` no estaban en el `ROLES_ACCESO_TOTAL` local de
   * `usuarios.service.ts`, así que `createUsuario` tomaba el camino de
   * `resolveEmpresaId` para ellos y terminaba creando una
   * `Membresia(rol: ASESOR)` corrupta -- mismo test que las dos anteriores
   * (ADMINISTRADOR/SUPERVISOR), ahora extendido a los dos roles holding-wide
   * nuevos.
   */
  it("SUPERVISOR_HOLDING: crea el Usuario SIN ninguna Membresia (holding-wide incondicional, Bloque F)", () =>
    conContexto(async () => {
      const creado = await createUsuario(actorHoldingWide, {
        nombre: "Supervisor Holding Nuevo",
        correo: `supervisor-holding-nuevo-${randomUUID()}@integracion.test`,
        password: "clave-supervisor-holding-123456",
        rol: "SUPERVISOR_HOLDING",
      });

      const membresias = await testAdminPrisma.membresia.findMany({ where: { usuarioId: creado.id } });
      expect(membresias).toEqual([]);
    }));

  it("SUPER_ADMIN: crea el Usuario SIN ninguna Membresia (triangulación: segundo rol holding-wide distinto, Bloque F)", () =>
    conContexto(async () => {
      const creado = await createUsuario(actorHoldingWide, {
        nombre: "Super Admin Nuevo",
        correo: `super-admin-nuevo-${randomUUID()}@integracion.test`,
        password: "clave-super-admin-123456",
        rol: "SUPER_ADMIN",
      });

      const membresias = await testAdminPrisma.membresia.findMany({ where: { usuarioId: creado.id } });
      expect(membresias).toEqual([]);
    }));

  it("ASESOR sin empresaId, actor holding-wide: rechaza con 400 empresa_requerida y NO persiste el Usuario (atomicidad)", () =>
    conContexto(async () => {
      const correo = `asesor-sin-empresa-${randomUUID()}@integracion.test`;

      await expect(
        createUsuario(actorHoldingWide, {
          nombre: "Asesor Sin Empresa",
          correo,
          password: "clave-asesor-123456",
          rol: "ASESOR",
        }),
      ).rejects.toMatchObject({ code: "empresa_requerida", statusHttp: 400 });

      const usuarioPersistido = await prisma.usuario.findUnique({ where: { correo } });
      expect(usuarioPersistido).toBeNull();
    }));

  /**
   * Fix (bug de seguridad: POST /usuarios no forzaba empresaId a la empresa
   * del actor) -- mismo criterio que `negociacion.producto.test.ts`.
   */
  it("ASESOR, actor company-scoped: ignora el empresaId del body y usa el de su propia sesión", () =>
    conContexto(async () => {
      const empresaAjena = await testAdminPrisma.empresa.create({
        data: { nombre: `Empresa ajena usuarios ${randomUUID()}` },
      });

      const creado = await createUsuario(actorCompanyScoped, {
        nombre: "Asesor Company Scoped",
        correo: `asesor-company-scoped-${randomUUID()}@integracion.test`,
        password: "clave-asesor-123456",
        rol: "ASESOR",
        empresaId: empresaAjena.id,
      });

      const membresia = await testAdminPrisma.membresia.findFirst({ where: { usuarioId: creado.id } });
      expect(membresia?.empresaId).toBe(BOOTSTRAP_EMPRESA_ID);
      expect(membresia?.empresaId).not.toBe(empresaAjena.id);
    }));
});

describe("usuarios.service — createEmpresaAdministrador", () => {
  it("crea un administrador de empresa con Usuario portador ADMINISTRADOR y Membresia ADMINISTRADOR activa sin filtrar passwordHash", () =>
    sinRestriccion(async () => {
      const empresa = await testAdminPrisma.empresa.create({
        data: { nombre: `Empresa admin service ${randomUUID()}` },
      });
      const correo = `admin-empresa-service-${randomUUID()}@integracion.test`;

      const resultado = await createEmpresaAdministrador(empresa.id, {
        nombre: "Administradora de Empresa Service",
        correo,
        password: "clave-admin-empresa-123456",
      });

      expect(resultado.membresia).toMatchObject({
        empresaId: empresa.id,
        rol: "ADMINISTRADOR",
        activa: true,
        correo,
      });
      expect(resultado.usuario).toMatchObject({
        nombre: "Administradora de Empresa Service",
        rol: "ADMINISTRADOR",
        activo: true,
      });
      expect(JSON.stringify(resultado)).not.toContain("passwordHash");

      const usuarioPersistido = await testAdminPrisma.usuario.findUniqueOrThrow({
        where: { id: resultado.usuario.id },
      });
      expect(usuarioPersistido.rol).toBe("ADMINISTRADOR");
      expect(usuarioPersistido.correo).not.toBe(correo);
    }));
});

describe("usuarios.service — deactivateUsuario (M2: baja lógica con reasignación obligatoria de cartera activa)", () => {
  it("asesor con cartera abierta y otro asesor activo disponible: baja exitosa, cada lead reasignado con evento REASIGNACION y SSE emitido", () =>
    conContexto(async () => {
      await desactivarTodos("ASESOR");

      const victima = await crearUsuario("ASESOR");
      const candidato = await crearUsuario("ASESOR");
      const leadUno = await crearLead({ asesorId: victima.id, etapa: "NUEVO" });
      const leadDos = await crearLead({ asesorId: victima.id, etapa: "CONTACTADO" });

      const publish = vi.spyOn(eventBroker, "publish");

      await deactivateUsuario(actorHoldingWide, victima.id);

      const victimaTrasBaja = await prisma.usuario.findUniqueOrThrow({ where: { id: victima.id } });
      expect(victimaTrasBaja.activo).toBe(false);

      for (const lead of [leadUno, leadDos]) {
        const leadActualizado = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
        expect(leadActualizado.asesorId).toBe(candidato.id);

        const evento = await prisma.leadEvento.findFirst({
          where: { leadId: lead.id, tipo: "REASIGNACION" },
        });
        expect(evento).not.toBeNull();
        expect(evento?.detalle).toMatchObject({
          motivo: "baja_usuario",
          responsableId: candidato.id,
          responsableAnteriorId: victima.id,
          ejecutadoPorId: null,
        });
      }

      expect(publish).toHaveBeenCalledWith(
        candidato.id,
        "lead.asignado",
        expect.objectContaining({ leadId: leadUno.id }),
        BOOTSTRAP_EMPRESA_ID,
      );
      expect(publish).toHaveBeenCalledWith(
        candidato.id,
        "lead.asignado",
        expect.objectContaining({ leadId: leadDos.id }),
        BOOTSTRAP_EMPRESA_ID,
      );
    }));

  it("cartera con varios leads se distribuye entre los candidatos por menor-carga-primero con UNA sola consulta de candidatos y de carga (no N+1)", () =>
    conContexto(async () => {
      await desactivarTodos("ASESOR");

      const victima = await crearUsuario("ASESOR");
      const candidatosCreados = await Promise.all([
        crearUsuario("ASESOR"),
        crearUsuario("ASESOR"),
        crearUsuario("ASESOR"),
      ]);
      const candidatoIds = candidatosCreados.map((c) => c.id).sort();

      const leads = await Promise.all(
        Array.from({ length: 6 }, () => crearLead({ asesorId: victima.id, etapa: "NUEVO" })),
      );

      // Fix (`deactivateUsuario` migrado a Membresia, ver
      // `usuarios.service.ts::POOLS_DE_CARTERA`): la cartera de este fixture
      // vive en UNA sola empresa (BOOTSTRAP), así que sigue siendo UNA sola
      // consulta de candidatos y de carga -- ahora vía las funciones
      // Membresia-based, mismas que `asignacion.service.ts` (Bloque D).
      const spyActivos = vi.spyOn(usuarioRepository, "findActivosPorRolMembresia");
      const spyCargas = vi.spyOn(leadRepository, "countCargaActivaPorResponsableEnEmpresa");

      await deactivateUsuario(actorHoldingWide, victima.id);

      expect(spyActivos).toHaveBeenCalledTimes(1);
      expect(spyCargas).toHaveBeenCalledTimes(1);
      spyActivos.mockRestore();
      spyCargas.mockRestore();

      const conteoPorCandidato = new Map<string, number>(candidatoIds.map((id) => [id, 0]));
      for (const lead of leads) {
        const leadActualizado = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
        expect(leadActualizado.asesorId).not.toBeNull();
        expect(candidatoIds).toContain(leadActualizado.asesorId);
        conteoPorCandidato.set(
          leadActualizado.asesorId as string,
          (conteoPorCandidato.get(leadActualizado.asesorId as string) ?? 0) + 1,
        );
      }

      // Los 3 candidatos arrancan con carga activa 0 — 6 leads distribuidos
      // por menor-carga-primero deben repartirse 2/2/2, nunca apilarse en uno.
      for (const id of candidatoIds) {
        expect(conteoPorCandidato.get(id)).toBe(2);
      }
    }));

  it("fix bulk writes: cartera grande (99 leads, 3 candidatos) se reparte ~33/33/33 con escrituras agrupadas por receptor, no N+1", () =>
    conContexto(async () => {
      await desactivarTodos("ASESOR");

      const victima = await crearUsuario("ASESOR");
      const candidatosCreados = await Promise.all([
        crearUsuario("ASESOR"),
        crearUsuario("ASESOR"),
        crearUsuario("ASESOR"),
      ]);
      const candidatoIds = candidatosCreados.map((c) => c.id).sort();

      const TOTAL_LEADS = 99;
      const leads = await Promise.all(
        Array.from({ length: TOTAL_LEADS }, () => crearLead({ asesorId: victima.id, etapa: "NUEVO" })),
      );

      const spyBulkAssign = vi.spyOn(leadRepository, "assignResponsableBulk");
      const spyBulkUltimaAsignacion = vi.spyOn(usuarioRepository, "updateUltimaAsignacionBulk");
      const spyBulkEventos = vi.spyOn(leadEventoRepository, "createEventos");
      const spyBulkNotificaciones = vi.spyOn(notificacionRepository, "createNotificaciones");

      // Guardrail: el camino N+1 (una escritura singular por lead) debe haber
      // desaparecido por completo de `deactivateUsuario`.
      const spySingularAssign = vi.spyOn(leadRepository, "assignResponsable");
      const spySingularUltimaAsignacion = vi.spyOn(usuarioRepository, "updateUltimaAsignacion");
      const spySingularEvento = vi.spyOn(leadEventoRepository, "createEvento");
      const spySingularNotificacion = vi.spyOn(notificacionRepository, "createNotificacion");

      await deactivateUsuario(actorHoldingWide, victima.id);

      // Con 3 candidatos que arrancan en carga 0 y reparto por menor-carga-
      // primero, los 3 reciben carga en algún momento del reparto — la función
      // bulk de leads se llama una vez POR RECEPTOR CON CARGA, nunca una vez
      // por lead.
      expect(spyBulkAssign).toHaveBeenCalledTimes(3);
      expect(spyBulkUltimaAsignacion).toHaveBeenCalledTimes(1);
      expect(spyBulkEventos).toHaveBeenCalledTimes(1);
      expect(spyBulkNotificaciones).toHaveBeenCalledTimes(1);

      expect(spySingularAssign).toHaveBeenCalledTimes(0);
      expect(spySingularUltimaAsignacion).toHaveBeenCalledTimes(0);
      expect(spySingularEvento).toHaveBeenCalledTimes(0);
      expect(spySingularNotificacion).toHaveBeenCalledTimes(0);

      spyBulkAssign.mockRestore();
      spyBulkUltimaAsignacion.mockRestore();
      spyBulkEventos.mockRestore();
      spyBulkNotificaciones.mockRestore();
      spySingularAssign.mockRestore();
      spySingularUltimaAsignacion.mockRestore();
      spySingularEvento.mockRestore();
      spySingularNotificacion.mockRestore();

      const conteoPorCandidato = new Map<string, number>(candidatoIds.map((id) => [id, 0]));
      for (const lead of leads) {
        const leadActualizado = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
        expect(leadActualizado.asesorId).not.toBeNull();
        expect(candidatoIds).toContain(leadActualizado.asesorId);
        conteoPorCandidato.set(
          leadActualizado.asesorId as string,
          (conteoPorCandidato.get(leadActualizado.asesorId as string) ?? 0) + 1,
        );
      }

      for (const id of candidatoIds) {
        expect(conteoPorCandidato.get(id)).toBe(TOTAL_LEADS / 3);
      }

      // Cada lead tiene su propio evento REASIGNACION, aun escrito en lote.
      const totalEventos = await prisma.leadEvento.count({
        where: { leadId: { in: leads.map((l) => l.id) }, tipo: "REASIGNACION" },
      });
      expect(totalEventos).toBe(TOTAL_LEADS);
    }));

  it("vendedor con cartera abierta (leads traspasados) y otro vendedor activo disponible: baja exitosa con evento TRASPASO", () =>
    conContexto(async () => {
      await desactivarTodos("VENDEDOR");

      const victima = await crearUsuario("VENDEDOR");
      const candidato = await crearUsuario("VENDEDOR");
      const asesor = await crearUsuario("ASESOR", false);
      const lead = await crearLead({ asesorId: asesor.id, vendedorId: victima.id, etapa: "CITA" });

      await deactivateUsuario(actorHoldingWide, victima.id);

      const victimaTrasBaja = await prisma.usuario.findUniqueOrThrow({ where: { id: victima.id } });
      expect(victimaTrasBaja.activo).toBe(false);

      const leadActualizado = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(leadActualizado.vendedorId).toBe(candidato.id);

      const evento = await prisma.leadEvento.findFirst({
        where: { leadId: lead.id, tipo: "TRASPASO" },
      });
      expect(evento).not.toBeNull();
      expect(evento?.detalle).toMatchObject({
        motivo: "baja_usuario",
        responsableId: candidato.id,
        responsableAnteriorId: victima.id,
        ejecutadoPorId: null,
      });
    }));

  it("asesor último activo de su rol con cartera abierta: baja RECHAZADA (409) y nada se persiste", () =>
    conContexto(async () => {
      await desactivarTodos("ASESOR");

      const victima = await crearUsuario("ASESOR");
      const lead = await crearLead({ asesorId: victima.id, etapa: "NUEVO" });

      await expect(deactivateUsuario(actorHoldingWide, victima.id)).rejects.toMatchObject({
        code: "baja_sin_candidato_reasignacion",
        statusHttp: 409,
      });

      const victimaTrasIntento = await prisma.usuario.findUniqueOrThrow({ where: { id: victima.id } });
      expect(victimaTrasIntento.activo).toBe(true);

      const leadTrasIntento = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(leadTrasIntento.asesorId).toBe(victima.id);

      const eventosTrasIntento = await prisma.leadEvento.count({ where: { leadId: lead.id } });
      expect(eventosTrasIntento).toBe(0);
    }));

  it("asesor sin cartera abierta (todos los leads en etapa terminal): baja exitosa sin ningún candidato disponible", () =>
    conContexto(async () => {
      await desactivarTodos("ASESOR");

      const victima = await crearUsuario("ASESOR");
      const lead = await crearLead({ asesorId: victima.id, etapa: "VENTA" });

      await expect(deactivateUsuario(actorHoldingWide, victima.id)).resolves.toBeUndefined();

      const victimaTrasBaja = await prisma.usuario.findUniqueOrThrow({ where: { id: victima.id } });
      expect(victimaTrasBaja.activo).toBe(false);

      const leadTrasBaja = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(leadTrasBaja.asesorId).toBe(victima.id);

      const eventos = await prisma.leadEvento.count({ where: { leadId: lead.id } });
      expect(eventos).toBe(0);
    }));

  it("leads con vendedorId ya asignado (traspasados) NO se incluyen en la cartera de reasignación del asesor original", () =>
    conContexto(async () => {
      await desactivarTodos("ASESOR");

      const victima = await crearUsuario("ASESOR");
      const vendedor = await crearUsuario("VENDEDOR", false);
      const lead = await crearLead({ asesorId: victima.id, vendedorId: vendedor.id, etapa: "CITA" });

      // Sin otro asesor activo — si el lead traspasado contara como cartera del
      // asesor, la baja se rechazaría por falta de candidato.
      await expect(deactivateUsuario(actorHoldingWide, victima.id)).resolves.toBeUndefined();

      const victimaTrasBaja = await prisma.usuario.findUniqueOrThrow({ where: { id: victima.id } });
      expect(victimaTrasBaja.activo).toBe(false);

      const leadTrasBaja = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(leadTrasBaja.asesorId).toBe(victima.id);

      const eventos = await prisma.leadEvento.count({ where: { leadId: lead.id } });
      expect(eventos).toBe(0);
    }));

  /**
   * Fix (bug real confirmado, `usuarios.service.ts::POOLS_DE_CARTERA` -- ver
   * comentario de esa constante): ANTES, `POOL_BY_ROL[usuario.rol]` elegía
   * UN solo pool según el `Usuario.rol` legado del usuario dado de baja. Un
   * asesor habilitado para venta (`Usuario.rol` legado = `VENDEDOR`) es
   * candidato válido del pool `ASESOR` de asignación inicial DESDE que
   * `asignacion.service.ts::selectResponsableEnEmpresa("ASESOR", ...)` no
   * filtra por `habilitadoParaVenta` -- así que puede terminar con cartera
   * abierta en las DOS columnas FK a la vez: `asesorId` (leads que nunca
   * traspasó) y `vendedorId` (leads que recibió por traspaso). El mapa viejo
   * solo miraba el pool `VENDEDOR` para este usuario y dejaba la cartera
   * `asesorId` huérfana (FK apuntando a un usuario ya inactivo, sin
   * reasignar ni rechazar la baja).
   */
  it("fix (bug real): asesor habilitado para venta con cartera abierta en LOS DOS pools a la vez (asesorId sin traspasar + vendedorId traspasado) se reasigna en ambos, ninguna cartera queda huérfana", () =>
    conContexto(async () => {
      await desactivarTodos("VENDEDOR");
      await desactivarTodos("ASESOR");

      // Membresia(rol: ASESOR, habilitadoParaVenta: true) -- elegible para
      // AMBOS pools de asignación (D5).
      const victima = await crearUsuario("VENDEDOR");
      const candidatoAsesor = await crearUsuario("ASESOR");
      const candidatoVendedor = await crearUsuario("VENDEDOR");

      const leadAsesor = await crearLead({ asesorId: victima.id, etapa: "CONTACTADO" });
      const leadVendedor = await crearLead({
        asesorId: candidatoAsesor.id,
        vendedorId: victima.id,
        etapa: "CITA",
      });

      await deactivateUsuario(actorHoldingWide, victima.id);

      const victimaTrasBaja = await prisma.usuario.findUniqueOrThrow({ where: { id: victima.id } });
      expect(victimaTrasBaja.activo).toBe(false);

      const leadAsesorTrasBaja = await prisma.lead.findUniqueOrThrow({ where: { id: leadAsesor.id } });
      expect(leadAsesorTrasBaja.asesorId).not.toBeNull();
      expect(leadAsesorTrasBaja.asesorId).not.toBe(victima.id);
      const eventoAsesor = await prisma.leadEvento.findFirst({
        where: { leadId: leadAsesor.id, tipo: "REASIGNACION" },
      });
      expect(eventoAsesor).not.toBeNull();
      expect(eventoAsesor?.detalle).toMatchObject({
        motivo: "baja_usuario",
        responsableAnteriorId: victima.id,
        ejecutadoPorId: null,
      });

      const leadVendedorTrasBaja = await prisma.lead.findUniqueOrThrow({ where: { id: leadVendedor.id } });
      expect(leadVendedorTrasBaja.vendedorId).toBe(candidatoVendedor.id);
      const eventoVendedor = await prisma.leadEvento.findFirst({
        where: { leadId: leadVendedor.id, tipo: "TRASPASO" },
      });
      expect(eventoVendedor).not.toBeNull();
      expect(eventoVendedor?.detalle).toMatchObject({
        motivo: "baja_usuario",
        responsableId: candidatoVendedor.id,
        responsableAnteriorId: victima.id,
        ejecutadoPorId: null,
      });
    }));

  /**
   * Triangulación del fix de arriba (segundo caso distinto, TDD): con
   * candidato disponible en el pool `ASESOR` pero NINGUNO en `VENDEDOR`, la
   * baja se rechaza ENTERA -- ninguna de las dos carteras se toca, ni
   * siquiera la que sí tenía candidato. Prueba la atomicidad cross-pool: el
   * pool `ASESOR` se procesa primero en el loop y escribiría dentro de la
   * misma `tx` antes de que el pool `VENDEDOR` lance -- esa escritura debe
   * revertirse junto con el resto.
   */
  it("fix (triangulación): candidato disponible en ASESOR pero ninguno en VENDEDOR — baja RECHAZADA entera, ni siquiera la cartera ASESOR (que sí tenía candidato) se toca", () =>
    conContexto(async () => {
      await desactivarTodos("VENDEDOR");
      await desactivarTodos("ASESOR");

      const victima = await crearUsuario("VENDEDOR");
      const candidatoAsesor = await crearUsuario("ASESOR");

      const leadAsesor = await crearLead({ asesorId: victima.id, etapa: "CONTACTADO" });
      const leadVendedor = await crearLead({
        asesorId: candidatoAsesor.id,
        vendedorId: victima.id,
        etapa: "CITA",
      });

      await expect(deactivateUsuario(actorHoldingWide, victima.id)).rejects.toMatchObject({
        code: "baja_sin_candidato_reasignacion",
        statusHttp: 409,
      });

      const victimaTrasIntento = await prisma.usuario.findUniqueOrThrow({ where: { id: victima.id } });
      expect(victimaTrasIntento.activo).toBe(true);

      const leadAsesorTrasIntento = await prisma.lead.findUniqueOrThrow({ where: { id: leadAsesor.id } });
      expect(leadAsesorTrasIntento.asesorId).toBe(victima.id);

      const leadVendedorTrasIntento = await prisma.lead.findUniqueOrThrow({ where: { id: leadVendedor.id } });
      expect(leadVendedorTrasIntento.vendedorId).toBe(victima.id);

      const eventos = await prisma.leadEvento.count({
        where: { leadId: { in: [leadAsesor.id, leadVendedor.id] } },
      });
      expect(eventos).toBe(0);
    }));

  it("administrador dado de baja: sin cambios de comportamiento — nunca corre ningún paso de reasignación", () =>
    conContexto(async () => {
      const admin = await crearUsuario("ADMINISTRADOR");

      await expect(deactivateUsuario(actorHoldingWide, admin.id)).resolves.toBeUndefined();

      const adminTrasBaja = await prisma.usuario.findUniqueOrThrow({ where: { id: admin.id } });
      expect(adminTrasBaja.activo).toBe(false);
    }));

  it("supervisor dado de baja: sin cambios de comportamiento — nunca corre ningún paso de reasignación", () =>
    conContexto(async () => {
      const supervisor = await crearUsuario("SUPERVISOR");

      await expect(deactivateUsuario(actorHoldingWide, supervisor.id)).resolves.toBeUndefined();

      const supervisorTrasBaja = await prisma.usuario.findUniqueOrThrow({ where: { id: supervisor.id } });
      expect(supervisorTrasBaja.activo).toBe(false);
    }));

  it("404 con un id que no existe", () =>
    conContexto(async () => {
      await expect(
        deactivateUsuario(actorHoldingWide, "00000000-0000-0000-0000-000000000000"),
      ).rejects.toMatchObject({ code: "usuario_no_encontrado", statusHttp: 404 });
    }));
});

/**
 * Fix (bug de seguridad, decisión de equipo): una `Membresia.activa = false`
 * saca al usuario del alcance ADMINISTRATIVO de esa empresa para un admin
 * company-scoped (`usuarioRepository.existsEnEmpresa`/`buildWhere` ahora
 * exigen `activa: true`). No cubierto por `auth.service.ts::login` (ese
 * camino ya rechazaba el login de la propia membresía inactiva, sin tocar
 * este fix) -- acá se prueba el lado ADMINISTRATIVO: un admin de la MISMA
 * empresa deja de poder ver/editar a ese usuario mientras su membresía siga
 * desactivada.
 */
describe("usuarios.service — findUsuarioById (fix: Membresia.activa=false saca al usuario del alcance del admin de empresa)", () => {
  it("company-scoped: 404 cuando la única Membresia del usuario objetivo en esa empresa está desactivada", () =>
    conContexto(async () => {
      const objetivo = await prisma.usuario.create({
        data: {
          nombre: `Usuario membresía inactiva ${randomUUID()}`,
          correo: `usuario-membresia-inactiva-${randomUUID()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "ASESOR",
          activo: true,
        },
      });
      await testAdminPrisma.membresia.create({
        data: { usuarioId: objetivo.id, empresaId: BOOTSTRAP_EMPRESA_ID, rol: "ASESOR", habilitadoParaVenta: false, activa: false },
      });

      await expect(findUsuarioById(actorCompanyScoped, objetivo.id)).rejects.toMatchObject({
        code: "usuario_no_encontrado",
        statusHttp: 404,
      });
    }));

  it("company-scoped: 200 cuando la Membresia en esa empresa está activa (control positivo)", () =>
    conContexto(async () => {
      const objetivo = await prisma.usuario.create({
        data: {
          nombre: `Usuario membresía activa ${randomUUID()}`,
          correo: `usuario-membresia-activa-${randomUUID()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "ASESOR",
          activo: true,
        },
      });
      await testAdminPrisma.membresia.create({
        data: { usuarioId: objetivo.id, empresaId: BOOTSTRAP_EMPRESA_ID, rol: "ASESOR", habilitadoParaVenta: false, activa: true },
      });

      const encontrado = await findUsuarioById(actorCompanyScoped, objetivo.id);
      expect(encontrado.id).toBe(objetivo.id);
    }));

  it("holding-wide: sigue viendo al usuario aunque su única Membresia esté desactivada (sin restricción, D2)", () =>
    conContexto(async () => {
      const objetivo = await prisma.usuario.create({
        data: {
          nombre: `Usuario membresía inactiva holding ${randomUUID()}`,
          correo: `usuario-membresia-inactiva-holding-${randomUUID()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "ASESOR",
          activo: true,
        },
      });
      await testAdminPrisma.membresia.create({
        data: { usuarioId: objetivo.id, empresaId: BOOTSTRAP_EMPRESA_ID, rol: "ASESOR", habilitadoParaVenta: false, activa: false },
      });

      const encontrado = await findUsuarioById(actorHoldingWide, objetivo.id);
      expect(encontrado.id).toBe(objetivo.id);
    }));
});

/**
 * Fix (bug de seguridad: GET /usuarios/responsables no filtraba por
 * empresa) -- mismo criterio de 3 ramas que `findUsuarios`/`findBridges`.
 */
describe("usuarios.service — findResponsables (fix: scope por empresa)", () => {
  it("company-scoped: solo ve responsables con Membresia activa en su propia empresa", () =>
    conContexto(async () => {
      const empresaAjena = await testAdminPrisma.empresa.create({
        data: { nombre: `Empresa ajena responsables ${randomUUID()}` },
      });
      // Fix: `crearUsuario("ASESOR")` ya crea su propia Membresia activa en
      // BOOTSTRAP_EMPRESA_ID (ver comentario de esa función) -- una segunda
      // `membresia.create` acá duplicaría la tripleta
      // `(usuarioId, empresaId, rol)` y violaría el `@@unique` del schema.
      const asesorPropio = await crearUsuario("ASESOR");
      const asesorAjeno = await prisma.usuario.create({
        data: {
          nombre: `Asesor ajeno responsables ${randomUUID()}`,
          correo: `asesor-ajeno-responsables-${randomUUID()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "ASESOR",
          activo: true,
        },
      });
      await testAdminPrisma.membresia.create({
        data: { usuarioId: asesorAjeno.id, empresaId: empresaAjena.id, rol: "ASESOR", habilitadoParaVenta: false, activa: true },
      });

      const responsables = await findResponsables(actorCompanyScoped, { rol: "ASESOR" });
      const ids = responsables.map((r) => r.id);

      expect(ids).toContain(asesorPropio.id);
      expect(ids).not.toContain(asesorAjeno.id);
    }));

  it("holding-wide sin empresaId: ve responsables de cualquier empresa (D2)", () =>
    conContexto(async () => {
      const empresaAjena = await testAdminPrisma.empresa.create({
        data: { nombre: `Empresa ajena responsables holding ${randomUUID()}` },
      });
      const asesorAjeno = await prisma.usuario.create({
        data: {
          nombre: `Asesor ajeno responsables holding ${randomUUID()}`,
          correo: `asesor-ajeno-responsables-holding-${randomUUID()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "ASESOR",
          activo: true,
        },
      });
      await testAdminPrisma.membresia.create({
        data: { usuarioId: asesorAjeno.id, empresaId: empresaAjena.id, rol: "ASESOR", habilitadoParaVenta: false, activa: true },
      });

      const responsables = await findResponsables(actorHoldingWide, { rol: "ASESOR" });

      expect(responsables.map((r) => r.id)).toContain(asesorAjeno.id);
    }));

  it("holding-wide con empresaId de query: drill-down a UNA empresa puntual", () =>
    sinRestriccion(async () => {
      const [empresaX, empresaY] = await Promise.all([
        testAdminPrisma.empresa.create({ data: { nombre: `Empresa drill X responsables ${randomUUID()}` } }),
        testAdminPrisma.empresa.create({ data: { nombre: `Empresa drill Y responsables ${randomUUID()}` } }),
      ]);
      const usuarioX = await prisma.usuario.create({
        data: {
          nombre: `Asesor drill X ${randomUUID()}`,
          correo: `asesor-drill-x-${randomUUID()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "ASESOR",
          activo: true,
        },
      });
      const usuarioY = await prisma.usuario.create({
        data: {
          nombre: `Asesor drill Y ${randomUUID()}`,
          correo: `asesor-drill-y-${randomUUID()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "ASESOR",
          activo: true,
        },
      });
      await Promise.all([
        testAdminPrisma.membresia.create({
          data: { usuarioId: usuarioX.id, empresaId: empresaX.id, rol: "ASESOR", habilitadoParaVenta: false, activa: true },
        }),
        testAdminPrisma.membresia.create({
          data: { usuarioId: usuarioY.id, empresaId: empresaY.id, rol: "ASESOR", habilitadoParaVenta: false, activa: true },
        }),
      ]);

      const responsables = await findResponsables(actorHoldingWide, { rol: "ASESOR", empresaId: empresaX.id });
      const ids = responsables.map((r) => r.id);

      expect(ids).toContain(usuarioX.id);
      expect(ids).not.toContain(usuarioY.id);
    }));

  it("company-scoped: ignora el empresaId de query e igual queda acotado a su propia empresa", () =>
    conContexto(async () => {
      const empresaAjena = await testAdminPrisma.empresa.create({
        data: { nombre: `Empresa ajena responsables ignorado ${randomUUID()}` },
      });
      const asesorAjeno = await prisma.usuario.create({
        data: {
          nombre: `Asesor ajeno responsables ignorado ${randomUUID()}`,
          correo: `asesor-ajeno-responsables-ignorado-${randomUUID()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "ASESOR",
          activo: true,
        },
      });
      await testAdminPrisma.membresia.create({
        data: { usuarioId: asesorAjeno.id, empresaId: empresaAjena.id, rol: "ASESOR", habilitadoParaVenta: false, activa: true },
      });

      const responsables = await findResponsables(actorCompanyScoped, { rol: "ASESOR", empresaId: empresaAjena.id });

      expect(responsables.map((r) => r.id)).not.toContain(asesorAjeno.id);
    }));
});

/**
 * Bloque F (tarea 2): cuarto modo de `buildWhere` -- `query.soloHoldingWide`
 * filtra a los usuarios sin ninguna `Membresia` (`{ membresias: { none: {} } }`),
 * solo con efecto para un actor holding-wide. Cobertura HTTP end-to-end
 * (mismo query param a través de `requireRole`/`listUsuariosQuerySchema`)
 * vive en `tests/usuarios.routes.test.ts`; acá se prueba directo contra el
 * service, incluido el caso "actor company-scoped lo ignora" que no es
 * practico de armar por HTTP (requeriría loguear un ADMINISTRADOR
 * company-scoped vía credencial de Membresia, fuera del alcance de este fix).
 */
describe("usuarios.service — findUsuarios: soloHoldingWide (Bloque F, tarea 2)", () => {
  it("holding-wide con soloHoldingWide=true: solo devuelve usuarios SIN ninguna Membresia", () =>
    sinRestriccion(async () => {
      const termino = `SoloHoldingWide-${randomUUID()}`;
      const sinMembresia = await prisma.usuario.create({
        data: {
          nombre: `${termino} Sin Membresia`,
          correo: `solo-holding-wide-${randomUUID()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "SUPERVISOR",
          activo: true,
        },
      });
      const conMembresia = await prisma.usuario.create({
        data: {
          nombre: `${termino} Con Membresia`,
          correo: `con-membresia-${randomUUID()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "ASESOR",
          activo: true,
        },
      });
      await testAdminPrisma.membresia.create({
        data: { usuarioId: conMembresia.id, empresaId: BOOTSTRAP_EMPRESA_ID, rol: "ASESOR", habilitadoParaVenta: false, activa: true },
      });

      // Aislamiento por `busqueda` (mismo criterio que `usuarios.routes.test.ts`):
      // la suite completa corre archivos concurrentes contra la misma BD, así
      // que `limite: 100` por sí solo no garantiza que estos dos usuarios
      // caigan en la primera página.
      const resultado = await findUsuarios(
        actorHoldingWide,
        queryUsuariosBase({ soloHoldingWide: true, busqueda: termino }),
      );
      const ids = resultado.usuarios.map((u) => u.id);

      expect(ids).toContain(sinMembresia.id);
      expect(ids).not.toContain(conMembresia.id);
    }));

  it("triangulación: holding-wide SIN soloHoldingWide sigue viendo ambos usuarios (comportamiento previo sin cambios, D2)", () =>
    sinRestriccion(async () => {
      const termino = `SinFiltroHolding-${randomUUID()}`;
      const sinMembresia = await prisma.usuario.create({
        data: {
          nombre: `${termino} Sin Membresia`,
          correo: `sin-filtro-holding-${randomUUID()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "SUPERVISOR",
          activo: true,
        },
      });
      const conMembresia = await prisma.usuario.create({
        data: {
          nombre: `${termino} Con Membresia`,
          correo: `sin-filtro-con-membresia-${randomUUID()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "ASESOR",
          activo: true,
        },
      });
      await testAdminPrisma.membresia.create({
        data: { usuarioId: conMembresia.id, empresaId: BOOTSTRAP_EMPRESA_ID, rol: "ASESOR", habilitadoParaVenta: false, activa: true },
      });

      const resultado = await findUsuarios(actorHoldingWide, queryUsuariosBase({ busqueda: termino }));
      const ids = resultado.usuarios.map((u) => u.id);

      expect(ids).toContain(sinMembresia.id);
      expect(ids).toContain(conMembresia.id);
    }));

  it("actor company-scoped: soloHoldingWide=true se ignora, sigue forzado a su propia empresa", () =>
    conContexto(async () => {
      const termino = `CompanyScopedIgnora-${randomUUID()}`;
      const asesorPropio = await prisma.usuario.create({
        data: {
          nombre: `${termino} Asesor Propio`,
          correo: `company-scoped-ignora-${randomUUID()}@integracion.test`,
          passwordHash: "hash-no-usado",
          rol: "ASESOR",
          activo: true,
        },
      });
      await testAdminPrisma.membresia.create({
        data: { usuarioId: asesorPropio.id, empresaId: BOOTSTRAP_EMPRESA_ID, rol: "ASESOR", habilitadoParaVenta: false, activa: true },
      });

      const resultado = await findUsuarios(
        actorCompanyScoped,
        queryUsuariosBase({ soloHoldingWide: true, busqueda: termino }),
      );
      const ids = resultado.usuarios.map((u) => u.id);

      // El actor company-scoped ve su propio usuario (con Membresia) pese a
      // soloHoldingWide=true -- la rama `actor.empresaId !== null` corta
      // antes de mirar el query param (buildWhere, primera rama).
      expect(ids).toContain(asesorPropio.id);
    }));
});
