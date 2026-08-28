import type { RedSocial } from "@prisma/client";
import type { CampoLeadMapeable } from "../../types/bridgeApi/configuracion-bridge-api.js";
import type { LeadEntrante } from "../../types/lead-entrante.js";

/**
 * bridgeApi (RedSocial.API_EXTERNA): traduce UN item crudo del array JSON
 * que devuelve el GET del cliente a `LeadEntrante`, usando el `mapeoCampos`
 * configurado por bridge (`types/bridgeApi/configuracion-bridge-api.ts`) en
 * vez de un adaptador de código por proveedor, como `google-forms.adapter.ts`
 * o `meta.adapter.ts`.
 *
 * `bridgeId`/`redSocial` los resuelve el llamador (mismo criterio que el
 * resto de adaptadores: `redSocial` es el del bridge autenticado, nunca una
 * constante fija, aunque hoy solo `API_EXTERNA` llega hasta acá).
 *
 * Toda clave de `itemCrudo` que NO aparezca en `mapeoCampos` cae en
 * `camposDinamicos` — mismo criterio que "el resto del formulario" en los
 * demás adaptadores. Un campo mapeado ausente o vacío queda `null`, nunca un
 * placeholder inventado (Requirement: LeadEntrante contract).
 *
 * Lanza si el campo mapeado a `idExternoLead` no vino o vino vacío: sin eso
 * no hay idempotencia posible contra `LeadRecibido.@@unique([bridgeId,
 * idExternoLead])`, y Zod (`bridges.schema.ts`) solo puede validar que el
 * MAPEO declare esa clave al crear el bridge, nunca que el dato llegue en
 * cada item real. El llamador (futuro `services/bridgeApi/`) decide qué
 * hacer con el error por item — nunca aborta el poll entero por un item
 * malformado.
 */
export function adaptApiExterna(
  itemCrudo: Record<string, unknown>,
  mapeoCampos: Record<string, CampoLeadMapeable>,
  bridgeId: string,
  redSocial: RedSocial,
  recibidoEn: Date = new Date(),
): LeadEntrante {
  const valoresMapeados: Partial<Record<CampoLeadMapeable, string | null>> = {};
  const camposDinamicos: Record<string, unknown> = {};

  for (const [claveExterna, valor] of Object.entries(itemCrudo)) {
    const campoDestino = mapeoCampos[claveExterna];
    if (campoDestino) {
      valoresMapeados[campoDestino] = normalizarValorMapeado(valor);
    } else {
      camposDinamicos[claveExterna] = valor;
    }
  }

  const idExternoLead = valoresMapeados.idExternoLead;
  if (!idExternoLead) {
    throw new Error(
      "bridgeApi: el campo mapeado a idExternoLead no vino o vino vacio en este item -- sin idempotencia posible",
    );
  }

  return {
    redSocial,
    bridgeId,
    nombre: valoresMapeados.nombre ?? null,
    telefono: valoresMapeados.telefono ?? null,
    correo: valoresMapeados.correo ?? null,
    idExternoLead,
    idExternoCampania: valoresMapeados.idExternoCampania ?? null,
    nombreCampania: valoresMapeados.nombreCampania ?? null,
    idExternoCuenta: valoresMapeados.idExternoCuenta ?? null,
    camposDinamicos,
    // `ingresadoEn` (marca de tiempo de la PLATAFORMA origen, no de cuándo
    // hicimos el poll) queda en `recibidoEn` por ahora: `CampoLeadMapeable`
    // todavia no incluye un campo mapeable a `ingresadoEn`. Si en el futuro
    // hace falta preservar el timestamp real del cliente, se agrega ahí --
    // no se inventa un default distinto acá.
    ingresadoEn: recibidoEn,
    payloadOriginal: itemCrudo,
  };
}

function normalizarValorMapeado(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string") return valor.trim() === "" ? null : valor;
  return String(valor);
}
