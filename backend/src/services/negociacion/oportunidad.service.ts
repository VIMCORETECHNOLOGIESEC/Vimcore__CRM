import type { EtapaLead, Oportunidad, Prisma, RolUsuario } from "@prisma/client";
import { AppError } from "../../lib/app-error.js";
import { runInTransaction, type TransactionBounds } from "../../lib/prisma.js";
import * as membresiaRepository from "../../repositories/membresia.repository.js";
import * as membresiaPoolRepository from "../../repositories/negociacion/membresia-pool.repository.js";
import * as oportunidadEventoRepository from "../../repositories/negociacion/oportunidad-evento.repository.js";
import * as oportunidadRepository from "../../repositories/negociacion/oportunidad.repository.js";
import type { OportunidadConRelaciones } from "../../repositories/negociacion/oportunidad.repository.js";
import * as productoRepository from "../../repositories/negociacion/producto.repository.js";
import type {
  CerrarOportunidadBody,
  CrearOportunidadBody,
  ListOportunidadesQuery,
  PatchOportunidadEtapaBody,
  ReasignarOportunidadBody,
} from "../../schemas/negociacion/oportunidad.schema.js";
import type { AuthenticatedUser } from "../../types/authenticated-user.js";
import { asignarPorPool, withCasRetryOportunidad } from "./asignacion-oportunidad.service.js";
import {
  aplicarFiltroEmpresaOportunidad,
  canCerrarOportunidad,
  canEditOportunidad,
  canReadOportunidad,
} from "./oportunidad.access.js";

/**
 * negociacion (Bloque D): definida localmente en vez de agregar un export a
 * `lib/prisma.ts` -- ese archivo no está en la lista de "no tocar" del
 * batch, pero la instrucción del batch limita cualquier edición fuera de los
 * archivos nuevos al mínimo indispensable de registro de rutas
 * (`routes/index.ts`). Mismos números (10s/20s) que el resto de los bounds
 * de flujo de escritura propio de ese archivo (`ASIGNACION_TRANSACTION_BOUNDS`,
 * `GESTION_LEAD_TRANSACTION_BOUNDS`, etc.) -- crear/reasignar/cerrar/cambiar
 * etapa una Oportunidad es un flujo de escritura propio que nunca anida con
 * los de Lead.
 */
const NEGOCIACION_TRANSACTION_BOUNDS: TransactionBounds = { maxWait: 10_000, timeout: 20_000 };

// Bloque F (aditivo, decisión cerrada con el usuario): mismo alcance máximo
// que ADMINISTRADOR/SUPERVISOR para la excepción D9 -- el router
// (`negociacion.routes.ts`) ya deja pasar estos dos roles vía el bypass
// centralizado de `require-role.middleware.ts`; esta lista es el chequeo
// DEFENSIVO redundante dentro del servicio (mismo criterio que el resto de
// este archivo), así que debe coincidir.
const ROLES_ADMIN: readonly RolUsuario[] = [
  "ADMINISTRADOR",
  "SUPERVISOR",
  "SUPERVISOR_HOLDING",
  "SUPER_ADMIN",
];
const ETAPAS_CERRADAS: readonly EtapaLead[] = oportunidadRepository.ETAPAS_CERRADAS_OPORTUNIDAD;

/**
 * `PATCH /oportunidades/:id/etapa`: solo los dos pasos intermedios, mismo
 * progreso lineal hacia adelante que `leads.service.ts::TRANSICIONES_VALIDAS`
 * mapeado a lo que este endpoint expone (VENTA/NO_VENTA cierran por
 * `POST /cerrar`, nunca por acá).
 */
const TRANSICIONES_VALIDAS: Record<EtapaLead, readonly EtapaLead[]> = {
  NUEVO: ["CONTACTADO"],
  CONTACTADO: ["CITA"],
  CITA: [],
  VENTA: [],
  NO_VENTA: [],
};

function assertAbierta(oportunidad: Oportunidad): void {
  if (ETAPAS_CERRADAS.includes(oportunidad.etapa)) {
    throw new AppError(
      "oportunidad_cerrada",
      409,
      "La oportunidad ya está en una etapa terminal y no puede modificarse",
    );
  }
}

/**
 * `POST /oportunidades` (D13/D14/D3/D4): valida el `Lead` de origen ->
 * valida el `Producto` (si vino) pertenece a la misma empresa -> D14 (dedup)
 * -> crea -> asigna por pool. Todo en una única transacción.
 *
 * Decisión propia (no restringida por rol en el prompt del batch): cualquier
 * usuario autenticado con acceso a la empresa del `Lead` puede proponer una
 * nueva negociación -- mismo criterio de apertura que el resto de este
 * archivo, sin inventar una restricción de rol que el negocio no pidió.
 */
export async function crearOportunidad(
  usuario: AuthenticatedUser,
  body: CrearOportunidadBody,
): Promise<Oportunidad> {
  return runInTransaction(
    undefined,
    async (tx) => {
      // Lectura directa vía Prisma, no `lead.repository.ts` (archivo
      // congelado en este batch) -- solo se necesita `empresaId` para
      // denormalizar y validar acceso, nunca se escribe `Lead`.
      const lead = await tx.lead.findUnique({
        where: { id: body.leadId },
        select: { id: true, empresaId: true },
      });
      if (!lead) throw new AppError("lead_no_encontrado", 404, "El lead no existe");

      if (usuario.empresaId !== null && usuario.empresaId !== lead.empresaId) {
        throw new AppError("permiso_denegado", 403, "No tienes acceso a este lead");
      }

      const productoId = body.productoId ?? null;
      if (productoId !== null) {
        const producto = await productoRepository.findById(productoId, tx);
        if (!producto || producto.empresaId !== lead.empresaId) {
          throw new AppError("producto_invalido", 409, "El producto indicado no pertenece a esta empresa");
        }
      }

      const existente = await oportunidadRepository.findAbiertaPorLeadYProducto(body.leadId, productoId, tx);
      if (existente) {
        throw new AppError(
          "oportunidad_duplicada",
          409,
          "Ya existe una oportunidad abierta para este lead y producto",
        );
      }

      const creada = await oportunidadRepository.createOportunidad(
        { leadId: body.leadId, empresaId: lead.empresaId, productoId },
        tx,
      );

      await asignarPorPool(creada.id, lead.empresaId, new Date(), tx);

      const final = await oportunidadRepository.findRawById(creada.id, tx);
      if (!final) {
        throw new AppError("oportunidad_no_encontrada", 500, "Error interno al crear la oportunidad");
      }
      return final;
    },
    NEGOCIACION_TRANSACTION_BOUNDS,
  );
}

export async function obtenerOportunidad(
  usuario: AuthenticatedUser,
  id: string,
): Promise<OportunidadConRelaciones> {
  const oportunidad = await oportunidadRepository.findById(id);
  if (!oportunidad) throw new AppError("oportunidad_no_encontrada", 404, "La oportunidad no existe");
  if (!canReadOportunidad(usuario, oportunidad)) {
    throw new AppError("permiso_denegado", 403, "No tienes acceso a esta oportunidad");
  }
  return oportunidad;
}

/**
 * DD5 (mismo criterio que `leads.service.ts::buildWhere`): `empresaId`/
 * `asesorId` de query solo los aplica ADMINISTRADOR/SUPERVISOR -- un ASESOR/
 * VENDEDOR ya queda acotado a su propia cartera por el `where` de rol,
 * independiente de lo que envíe.
 */
function buildWhere(usuario: AuthenticatedUser, query: ListOportunidadesQuery): Prisma.OportunidadWhereInput {
  const where: Prisma.OportunidadWhereInput = aplicarFiltroEmpresaOportunidad({}, usuario);

  if (!ROLES_ADMIN.includes(usuario.rol)) {
    where.OR = [{ asesorId: usuario.id }, { vendedorId: usuario.id }];
  } else {
    if (query.empresaId) where.empresaId = query.empresaId;
    if (query.asesorId) where.asesorId = query.asesorId;
  }

  if (query.leadId) where.leadId = query.leadId;
  if (query.etapa) where.etapa = query.etapa;

  return where;
}

export interface ListarOportunidadesResult {
  oportunidades: OportunidadConRelaciones[];
  total: number;
  pagina: number;
  limite: number;
}

export async function listarOportunidades(
  usuario: AuthenticatedUser,
  query: ListOportunidadesQuery,
): Promise<ListarOportunidadesResult> {
  const where = buildWhere(usuario, query);
  const { oportunidades, total } = await oportunidadRepository.findMany(where, {
    skip: (query.pagina - 1) * query.limite,
    take: query.limite,
    orderBy: { creadaEn: "desc" },
  });
  return { oportunidades, total, pagina: query.pagina, limite: query.limite };
}

/** `PATCH /oportunidades/:id/etapa` -- transición intermedia NUEVO→CONTACTADO→CITA. */
export async function cambiarEtapaOportunidad(
  usuario: AuthenticatedUser,
  id: string,
  body: PatchOportunidadEtapaBody,
): Promise<Oportunidad> {
  return runInTransaction(
    undefined,
    async (tx) => {
      const oportunidad = await oportunidadRepository.findRawById(id, tx);
      if (!oportunidad) throw new AppError("oportunidad_no_encontrada", 404, "La oportunidad no existe");
      if (!canEditOportunidad(usuario, oportunidad)) {
        throw new AppError("permiso_denegado", 403, "No tienes permiso para modificar esta oportunidad");
      }
      assertAbierta(oportunidad);

      if (!TRANSICIONES_VALIDAS[oportunidad.etapa].includes(body.etapa)) {
        throw new AppError(
          "transicion_invalida",
          409,
          `No se puede pasar de ${oportunidad.etapa} a ${body.etapa}`,
        );
      }

      const actualizada = await oportunidadRepository.updateEtapa(id, { etapa: body.etapa }, tx);
      await oportunidadEventoRepository.createEvento(
        {
          oportunidadId: id,
          empresaId: oportunidad.empresaId,
          tipo: "ETAPA_CAMBIADA",
          usuarioId: usuario.id,
          etapaAnterior: oportunidad.etapa,
          etapaNueva: body.etapa,
        },
        tx,
      );
      return actualizada;
    },
    NEGOCIACION_TRANSACTION_BOUNDS,
  );
}

/** `POST /oportunidades/:id/cerrar` (D7: autoridad de cierre por Membresia). */
export async function cerrarOportunidad(
  usuario: AuthenticatedUser,
  id: string,
  body: CerrarOportunidadBody,
): Promise<Oportunidad> {
  return runInTransaction(
    undefined,
    async (tx) => {
      const oportunidad = await oportunidadRepository.findRawById(id, tx);
      if (!oportunidad) throw new AppError("oportunidad_no_encontrada", 404, "La oportunidad no existe");
      assertAbierta(oportunidad);

      const puedeCerrar = await canCerrarOportunidad(usuario, oportunidad, tx);
      if (!puedeCerrar) {
        throw new AppError("permiso_denegado", 403, "No tienes permiso para cerrar esta oportunidad");
      }

      const datos: Parameters<typeof oportunidadRepository.updateEtapa>[1] = {
        etapa: body.etapa,
        cerradaEn: new Date(),
      };
      if (body.etapa === "VENTA") {
        datos.montoVenta = body.montoVenta;
        datos.formaPago = body.formaPago;
      } else {
        datos.observacionCierre = body.observacionCierre;
      }

      const actualizada = await oportunidadRepository.updateEtapa(id, datos, tx);
      await oportunidadEventoRepository.createEvento(
        {
          oportunidadId: id,
          empresaId: oportunidad.empresaId,
          tipo: "CERRADA",
          usuarioId: usuario.id,
          etapaAnterior: oportunidad.etapa,
          etapaNueva: body.etapa,
        },
        tx,
      );
      return actualizada;
    },
    NEGOCIACION_TRANSACTION_BOUNDS,
  );
}

/**
 * `POST /oportunidades/:id/reasignar` (D9, excepción administrativa). La
 * ruta ya restringe el rol a ADMINISTRADOR/SUPERVISOR (`requireRole`) -- se
 * repite acá de forma defensiva, mismo criterio que
 * `asignacion.service.ts::assignLead` con `ROLES_ACCESO_TOTAL`.
 */
export async function reasignarOportunidadExcepcion(
  usuario: AuthenticatedUser,
  id: string,
  body: ReasignarOportunidadBody,
): Promise<Oportunidad> {
  if (!ROLES_ADMIN.includes(usuario.rol)) {
    throw new AppError("permiso_denegado", 403, "No tienes permiso para esta acción");
  }

  return withCasRetryOportunidad(() =>
    runInTransaction(
      undefined,
      async (tx: Prisma.TransactionClient) => {
        const oportunidad = await oportunidadRepository.findRawById(id, tx);
        if (!oportunidad) throw new AppError("oportunidad_no_encontrada", 404, "La oportunidad no existe");
        assertAbierta(oportunidad);

        if (usuario.empresaId !== null && usuario.empresaId !== oportunidad.empresaId) {
          throw new AppError("permiso_denegado", 403, "No tienes acceso a esta oportunidad");
        }

        // Decisión propia (no especificada, mismo criterio defensivo que
        // `asignacion.service.ts::resolveReceptor` para Lead): reasignar al
        // mismo titular actual no tiene sentido de negocio y solo
        // incrementaría `version`/emitiría un evento duplicado sin cambio
        // real.
        if (body.asesorId === oportunidad.asesorId) {
          throw new AppError(
            "destinatario_invalido",
            409,
            "El destinatario no puede ser el responsable actual",
          );
        }

        const target = await membresiaPoolRepository.findUsuarioActivoById(body.asesorId, tx);
        if (!target) {
          throw new AppError("usuario_invalido", 409, "El usuario indicado no existe o está inactivo");
        }

        // D9: lazy -- solo se crea la Membresia si el destinatario NO tiene
        // ya una activa para esta empresa; nunca se pre-provisiona de
        // antemano "por si acaso".
        const membresiaExistente = await membresiaPoolRepository.findMembresiaAsesorActiva(
          body.asesorId,
          oportunidad.empresaId,
          tx,
        );
        if (!membresiaExistente) {
          await membresiaRepository.createMembresia(
            {
              usuarioId: body.asesorId,
              empresaId: oportunidad.empresaId,
              rol: "ASESOR",
              habilitadoParaVenta: true,
            },
            tx,
          );
        }

        const actualizada = await oportunidadRepository.assignAsesor(
          id,
          { asesorId: body.asesorId },
          oportunidad.version,
          tx,
        );

        // D9: SIEMPRE `ASIGNADA_EXCEPCION_ADMINISTRATIVA` para este camino,
        // exista o no ya la Membresia -- la distinción "pool normal vs.
        // excepción" vive en QUÉ ENDPOINT se usó, no en si hubo que crear la
        // Membresia al vuelo (un admin polifuncional con Membresia
        // permanente que use ESTE endpoint también genera este evento; solo
        // el pool automático de `crearOportunidad` genera `ASIGNADA_POOL`).
        await oportunidadEventoRepository.createEvento(
          {
            oportunidadId: id,
            empresaId: oportunidad.empresaId,
            tipo: "ASIGNADA_EXCEPCION_ADMINISTRATIVA",
            usuarioId: usuario.id,
            detalle: {
              asesorAnteriorId: oportunidad.asesorId,
              asesorNuevoId: body.asesorId,
            },
          },
          tx,
        );

        return actualizada;
      },
      NEGOCIACION_TRANSACTION_BOUNDS,
    ),
  );
}
