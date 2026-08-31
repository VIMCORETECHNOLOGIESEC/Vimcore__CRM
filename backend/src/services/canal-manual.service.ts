import { Prisma, type CanalManual } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import * as canalManualRepository from "../repositories/canal-manual.repository.js";
import type {
  CrearCanalManualBody,
  EditarCanalManualBody,
  ListCanalesManualesQuery,
} from "../schemas/canal-manual.schema.js";
import type { AuthenticatedUser } from "../types/authenticated-user.js";

/**
 * Mismo criterio anti-escalamiento que `producto.service.ts::resolveEmpresaId`
 * (y `bridge.service.ts`/`usuarios.service.ts`, mismo patrón duplicado
 * deliberadamente por archivo en todo este código base, no un helper
 * compartido): una sesión company-scoped nunca elige su empresa por body; una
 * sesión holding-wide sin `Membresia` propia debe traerla explícita.
 */
function resolveEmpresaId(usuario: AuthenticatedUser, empresaIdBody: string | undefined): string {
  if (usuario.empresaId !== null) return usuario.empresaId;
  if (!empresaIdBody) {
    throw new AppError(
      "empresa_requerida",
      400,
      "Debes indicar empresaId explícitamente para una sesión holding-wide",
    );
  }
  return empresaIdBody;
}

/** `POST /canales-manuales` -- gestión del catálogo, rol fijo restringido en la ruta. */
export async function crearCanalManual(
  usuario: AuthenticatedUser,
  body: CrearCanalManualBody,
): Promise<CanalManual> {
  const empresaId = resolveEmpresaId(usuario, body.empresaId);
  try {
    return await canalManualRepository.createCanalManual({ empresaId, nombre: body.nombre });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("canal_manual_duplicado", 409, "Ya existe un canal manual con ese nombre en esta empresa");
    }
    throw error;
  }
}

/**
 * `GET /canales-manuales`: Administrador/Supervisor/Asesor/holding listan
 * para elegir canal al cargar un lead manual (`canCreateManual`, mismo
 * conjunto de roles) -- `empresaId` de query solo aplica a una sesión
 * holding-wide, mismo criterio que `resolveEmpresaId` arriba.
 */
export async function listarCanalesManuales(
  usuario: AuthenticatedUser,
  query: ListCanalesManualesQuery,
): Promise<CanalManual[]> {
  const where: Prisma.CanalManualWhereInput = {};
  if (usuario.empresaId !== null) {
    where.empresaId = usuario.empresaId;
  } else if (query.empresaId) {
    where.empresaId = query.empresaId;
  }
  if (query.activo !== undefined) where.activo = query.activo;

  return canalManualRepository.findMany(where);
}

/**
 * `PATCH /canales-manuales/:id`: verifica que el canal pertenezca a la
 * empresa de la sesión ANTES de editar -- sin esto, un id directo permitiría
 * editar el canal de otra empresa. Mismo criterio que
 * `leads.access.ts::empresaCoincide`: `usuario.empresaId === null` es
 * holding-wide (sin restricción, D2); cualquier otro valor exige coincidencia
 * exacta. RLS (rol `crm_app`) ya lo evita a nivel de fila para una sesión
 * company-scoped -- este chequeo es defensa en profundidad explícita, y el
 * único punto real para una sesión holding-wide (sin GUC restrictivo). 404
 * genérico en vez de 403 -- "Direct id access is denied, not leaked" (mismo
 * principio que el resto de `leads.access.ts`): un canal de otra empresa no
 * debe distinguirse de uno inexistente.
 */
export async function editarCanalManual(
  usuario: AuthenticatedUser,
  id: string,
  body: EditarCanalManualBody,
): Promise<CanalManual> {
  const canal = await canalManualRepository.findById(id);
  if (!canal) throw new AppError("canal_manual_no_encontrado", 404, "El canal manual no existe");
  if (usuario.empresaId !== null && usuario.empresaId !== canal.empresaId) {
    throw new AppError("canal_manual_no_encontrado", 404, "El canal manual no existe");
  }

  try {
    return await canalManualRepository.updateCanalManual(id, {
      nombre: body.nombre,
      activo: body.activo,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("canal_manual_duplicado", 409, "Ya existe un canal manual con ese nombre en esta empresa");
    }
    throw error;
  }
}
