import type { Membresia } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

/**
 * negociacion (Bloque D, D3/D4/D7/D9): consultas de `Membresia`/`Usuario`
 * propias del pool de asignación y de la autoridad de cierre de
 * `Oportunidad` -- NUEVAS a propósito, ver el comentario de cabecera de
 * `asignacion-oportunidad.service.ts` y `oportunidad.access.ts` para la
 * razón de no reusar `usuario.repository.ts`/`asignacion.service.ts`
 * (archivos deliberadamente fuera de alcance de este batch aditivo).
 *
 * `Usuario.ultimaAsignacionEn` (usada abajo para el desempate FIFO, D-DD7 de
 * `asignacion.service.ts`) vive en la tabla `usuarios`, no en `membresias` --
 * este archivo la lee/escribe con el cliente Prisma directo, sin importar
 * `usuario.repository.ts` (archivo congelado en este batch), para no crear
 * ninguna arista de dependencia hacia él.
 *
 * Decisión aceptada con el usuario (no es un descuido): esta misma columna
 * la sigue usando el pool VIEJO de `Lead` (`asignacion.service.ts`) para su
 * propio desempate FIFO -- los dos pools comparten el mismo "última vez
 * ocupado" de un asesor, así que una asignación de `Lead` puede afectar el
 * desempate de `Oportunidad` y viceversa. Efecto real: rotación un poco
 * menos precisa entre los dos sistemas mientras coexistan -- nunca datos
 * incorrectos ni doble asignación. Se resuelve solo cuando el corte le dé a
 * `Oportunidad` su propia columna de rotación, separada de `Lead` para
 * siempre; hasta entonces, queda así a propósito.
 */
export interface CandidatoAsesor {
  id: string;
  ultimaAsignacionEn: Date | null;
}

/**
 * D3/D4: candidatos del pool de asignación de `Oportunidad` -- `Usuario` con
 * `Membresia` activa, `rol: ASESOR`, en la empresa de la `Oportunidad`, con
 * `Usuario.activo = true`. A diferencia del pool de `Lead` (`asignacion.
 * service.ts`, dos roles `ASESOR`/`VENDEDOR` sobre `Usuario.rol`), acá no hay
 * distinción: `RolMembresia` solo tiene `ASESOR` -- `habilitadoParaVenta` es
 * un flag interno (D7, autoridad de cierre), no un segundo pool. Por eso el
 * pool de `Oportunidad` es un único conjunto sin filtrar por ese flag.
 */
export async function findActivosAsesoresPorEmpresa(
  empresaId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<CandidatoAsesor[]> {
  const membresias = await client.membresia.findMany({
    where: { activa: true, rol: "ASESOR", empresaId, usuario: { activo: true } },
    select: { usuario: { select: { id: true, ultimaAsignacionEn: true } } },
  });
  return membresias.map(({ usuario }) => ({ id: usuario.id, ultimaAsignacionEn: usuario.ultimaAsignacionEn }));
}

/**
 * D9: ¿el destinatario de una reasignación administrativa ya tiene una
 * `Membresia(empresaId, rol: ASESOR)` activa? Si no, `oportunidad.service.ts`
 * crea una al vuelo (`membresia.repository.ts::createMembresia`, reusada tal
 * cual) -- nunca se pre-provisiona de antemano.
 */
export async function findMembresiaAsesorActiva(
  usuarioId: string,
  empresaId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Membresia | null> {
  return client.membresia.findFirst({ where: { usuarioId, empresaId, rol: "ASESOR", activa: true } });
}

/**
 * D7: autoridad de cierre -- `Membresia` activa, `rol: ASESOR`,
 * `habilitadoParaVenta: true`, en la empresa de la `Oportunidad`.
 */
export async function findMembresiaAsesorHabilitada(
  usuarioId: string,
  empresaId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Membresia | null> {
  return client.membresia.findFirst({
    where: { usuarioId, empresaId, rol: "ASESOR", activa: true, habilitadoParaVenta: true },
  });
}

/** D9: valida que el destinatario explícito de una reasignación exista y esté activo. */
export async function findUsuarioActivoById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<{ id: string } | null> {
  return client.usuario.findFirst({ where: { id, activo: true }, select: { id: true } });
}

/**
 * D10 (mismo criterio que `usuario.repository.ts::updateUltimaAsignacion`
 * para el pool de `Lead`): actualiza el desempate FIFO del receptor tras una
 * asignación por pool exitosa de `Oportunidad`.
 */
export async function updateUltimaAsignacion(
  usuarioId: string,
  ahora: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.usuario.update({ where: { id: usuarioId }, data: { ultimaAsignacionEn: ahora } });
}
