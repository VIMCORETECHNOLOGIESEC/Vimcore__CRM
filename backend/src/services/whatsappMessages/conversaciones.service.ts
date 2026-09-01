import type { Mensaje, Prisma } from "@prisma/client";
import { AppError } from "../../lib/app-error.js";
import { decrypt } from "../../lib/cifrado-token.js";
import * as conversacionLecturaRepository from "../../repositories/whatsappMessages/conversacion-lectura.repository.js";
import * as conversacionRepository from "../../repositories/whatsappMessages/conversacion.repository.js";
import type { ConversacionConRelaciones } from "../../repositories/whatsappMessages/conversacion.repository.js";
import * as mensajeRepository from "../../repositories/whatsappMessages/mensaje.repository.js";
import * as whatsappConexionRepository from "../../repositories/whatsappMessages/whatsapp-conexion.repository.js";
import type {
  ListConversacionesQuery,
  ListMensajesQuery,
  PostMensajeBody,
} from "../../schemas/whatsappMessages/conversaciones.schema.js";
import type {
  ConversacionListItemDto,
  ConversacionListResultDto,
  MensajeDto,
  MensajesListResultDto,
} from "../../types/whatsappMessages/conversacion.dto.js";
import { publishCommittedEvents } from "../committed-events.service.js";
import { aplicarFiltroEmpresa } from "../leads.access.js";
import { canReply, canView, ROLES_ACCESO_TOTAL, type UsuarioAccesoConversacion } from "./conversaciones.access.js";
import { enviarMensajeTexto } from "./whatsapp-cloud-api.service.js";

/**
 * D-mensajería (leído/no leído): "no leído" se DERIVA acá, nunca se
 * persiste por mensaje -- `leidoHastaEn` es el watermark de ESTE usuario
 * para esta conversación (`undefined` = nunca la marcó como leída).
 * `ultimoMensajeEn === null` (conversación recién creada, sin mensajes
 * todavía) nunca cuenta como no leída -- no hay nada que leer.
 */
function toListItemDto(
  conversacion: ConversacionConRelaciones,
  leidoHastaEn: Date | undefined,
): ConversacionListItemDto {
  const noLeido =
    conversacion.ultimoMensajeEn !== null &&
    (leidoHastaEn === undefined || conversacion.ultimoMensajeEn > leidoHastaEn);
  return {
    id: conversacion.id,
    clienteId: conversacion.clienteId,
    clienteNombre: conversacion.cliente.nombre,
    clienteTelefono: conversacion.cliente.telefonoOriginal,
    asesorId: conversacion.asesorId,
    asesorNombre: conversacion.asesor?.nombre ?? null,
    ultimoMensajeEn: conversacion.ultimoMensajeEn?.toISOString() ?? null,
    creadaEn: conversacion.creadaEn.toISOString(),
    noLeido,
  };
}

function toMensajeDto(mensaje: Mensaje): MensajeDto {
  return {
    id: mensaje.id,
    conversacionId: mensaje.conversacionId,
    direccion: mensaje.direccion,
    texto: mensaje.texto,
    usuarioId: mensaje.usuarioId,
    enviadoEn: mensaje.enviadoEn.toISOString(),
  };
}

function conversacionNoEncontrada(): AppError {
  return new AppError("conversacion_no_encontrada", 404, "La conversación no existe");
}

function permisoDenegado(): AppError {
  return new AppError("permiso_denegado", 403, "No tienes permiso para esta acción");
}

/**
 * `GET /conversaciones` — RBAC por listado (mismo criterio D4/D5 que
 * `leads.service.ts::buildWhere`): Admin/Supervisor ven todas las de su
 * alcance de empresa (holding-wide si `empresaId === null`, rule 4); el
 * resto solo las suyas (`asesorId = usuario.id`).
 *
 * Hotfix: `clienteId` (opcional) resuelve qué conversación abrir desde el
 * detalle de un lead puntual — SIEMPRE aditivo, se agrega DESPUÉS del scope
 * RBAC de arriba y nunca lo reemplaza (todas las claves de `where` se
 * combinan con AND por defecto en Prisma) — un asesor pidiendo el
 * `clienteId` de una conversación ajena sigue sin verla, `asesorId` sigue
 * exigiéndose igual.
 *
 * Fix (drill-down holding-wide, 2026-08-31): `aplicarFiltroEmpresa`
 * (`leads.access.ts`, ya reusado por `metricas.access.ts`) agrega la tercera
 * rama que faltaba acá -- sesión holding-wide CON `query.empresaId` acota a
 * esa empresa puntual; sin él, sigue agregando todo el holding (sin cambio
 * de comportamiento). Antes de este fix, una sesión holding-wide "entrando"
 * a la vista de una empresa seguía viendo TODAS las conversaciones
 * mezcladas -- no era una fuga cross-empresa (cada `Conversacion` ya tenía
 * su `empresaId` real correcto), pero el listado nunca las separaba.
 */
export async function listConversaciones(
  usuario: UsuarioAccesoConversacion,
  query: ListConversacionesQuery,
): Promise<ConversacionListResultDto> {
  const where: Prisma.ConversacionWhereInput = aplicarFiltroEmpresa({}, usuario, query);
  if (!ROLES_ACCESO_TOTAL.includes(usuario.rol)) where.asesorId = usuario.id;
  if (query.clienteId) where.clienteId = query.clienteId;

  const { conversaciones, total } = await conversacionRepository.findMany(where, {
    skip: (query.pagina - 1) * query.limite,
    take: query.limite,
  });

  // D-mensajería (leído/no leído): una sola consulta en bloque para toda la
  // página, nunca N+1 por fila -- ver `conversacion-lectura.repository.ts`.
  const lecturas = await conversacionLecturaRepository.findLeidoHastaPorConversaciones(
    usuario.id,
    conversaciones.map((c) => c.id),
  );
  const leidoHastaPorConversacion = new Map(lecturas.map((l) => [l.conversacionId, l.leidoHastaEn]));

  return {
    conversaciones: conversaciones.map((c) => toListItemDto(c, leidoHastaPorConversacion.get(c.id))),
    total,
  };
}

/**
 * `POST /conversaciones/:id/leido` — marca la conversación como leída HASTA
 * AHORA para el usuario actual (D-mensajería, leído/no leído). Misma
 * titularidad que ver/responder (`canView`) -- no hay una regla más laxa
 * para esta acción. Publica `whatsapp.conversacion-leida` por el mismo canal
 * SSE que ya usan `whatsapp.mensaje-nuevo`/`notificacion.nueva`
 * (`committed-events.service.ts`), dirigido SOLO a este usuario -- sincroniza
 * el badge entre sus propias pestañas/dispositivos, nunca afecta el estado
 * de lectura de otro rol que también mira esta conversación.
 */
export async function marcarConversacionLeida(
  usuario: UsuarioAccesoConversacion,
  conversacionId: string,
  ahora: Date = new Date(),
): Promise<void> {
  const conversacion = await conversacionRepository.findById(conversacionId);
  if (!conversacion) throw conversacionNoEncontrada();
  if (!canView(usuario, conversacion)) throw permisoDenegado();

  await conversacionLecturaRepository.upsertLeidoHasta({
    conversacionId,
    usuarioId: usuario.id,
    empresaId: conversacion.empresaId,
    leidoHastaEn: ahora,
  });

  publishCommittedEvents([
    {
      userId: usuario.id,
      empresaId: conversacion.empresaId,
      type: "whatsapp.conversacion-leida",
      data: { conversacionId, usuarioId: usuario.id },
    },
  ]);
}

/** `GET /conversaciones/:id/mensajes` — historial paginado, más reciente primero. */
export async function getMensajes(
  usuario: UsuarioAccesoConversacion,
  conversacionId: string,
  query: ListMensajesQuery,
): Promise<MensajesListResultDto> {
  const conversacion = await conversacionRepository.findById(conversacionId);
  if (!conversacion) throw conversacionNoEncontrada();
  if (!canView(usuario, conversacion)) throw permisoDenegado();

  const { mensajes, total } = await mensajeRepository.findByConversacionPaginado(
    conversacionId,
    (query.pagina - 1) * query.limite,
    query.limite,
  );

  return { mensajes: mensajes.map(toMensajeDto), total };
}

/**
 * `POST /conversaciones/:id/mensajes` — el asesor responde: llama a la
 * Cloud API con el token de la `WhatsAppConexion` de la empresa (I/O externo
 * deliberadamente fuera de cualquier transacción de base de datos, mismo
 * principio que `linkedin-oauth.service.ts::exchangeAuthorizationCode`), y
 * solo persiste el `Mensaje` SALIENTE tras una confirmación real de Meta
 * (`wamid` devuelto) — nunca un envío "optimista".
 */
export async function postMensaje(
  usuario: UsuarioAccesoConversacion,
  conversacionId: string,
  body: PostMensajeBody,
  ahora: Date = new Date(),
): Promise<MensajeDto> {
  const conversacion = await conversacionRepository.findById(conversacionId);
  if (!conversacion) throw conversacionNoEncontrada();
  if (!canReply(usuario, conversacion)) throw permisoDenegado();

  const conexion = await whatsappConexionRepository.findWithToken(conversacion.empresaId);
  if (!conexion || conexion.tokenCifrado === null || conexion.estado !== "ACTIVA") {
    throw new AppError(
      "whatsapp_conexion_no_disponible",
      503,
      "No hay una conexión de WhatsApp activa para esta empresa",
    );
  }

  const destinatario = conversacion.cliente.telefonoNormalizado?.replace(/^\+/, "") ?? "";
  if (!destinatario) {
    throw new AppError(
      "whatsapp_cliente_sin_telefono",
      422,
      "El cliente de esta conversación no tiene un teléfono válido para responder",
    );
  }

  const tokenPlano = decrypt(conexion.tokenCifrado);
  const envio = await enviarMensajeTexto(conexion.numeroTelefonoId, tokenPlano, destinatario, body.texto);

  const mensaje = await mensajeRepository.createSaliente({
    conversacionId,
    idExternoMensaje: envio.wamid,
    texto: body.texto,
    usuarioId: usuario.id,
    enviadoEn: ahora,
  });
  await conversacionRepository.touchUltimoMensajeEn(conversacionId, ahora);

  if (conversacion.asesorId) {
    publishCommittedEvents([
      {
        userId: conversacion.asesorId,
        empresaId: conversacion.empresaId,
        type: "whatsapp.mensaje-nuevo",
        data: { conversacionId },
      },
    ]);
  }

  return toMensajeDto(mensaje);
}
