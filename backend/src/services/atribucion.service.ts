import * as campaniaRepository from "../repositories/campania.repository.js";
import * as cuentaPublicitariaRepository from "../repositories/cuenta-publicitaria.repository.js";
import type { PrismaClientOrTransaction } from "../lib/prisma.js";
import type { LeadEntrante } from "../types/lead-entrante.js";

/**
 * M-hardening Bloque A (WU4, spec lead-attribution, D6, D9 del diseño):
 * atribución canónica resuelta por lookup de DOS PASOS — la campaña depende
 * de la cuenta ya resuelta, porque `Campania` es única por
 * `cuentaPublicitariaId`, no por bridge (a diferencia de
 * `CuentaPublicitaria`, única por `bridgeId`). Los escalares crudos
 * (`idExternoCuenta`/`idExternoCampania`/`nombreCampania`) SIEMPRE se
 * devuelven tal cual vinieron en `entrada`, con o sin match canónico.
 */
export interface AtribucionResuelta {
  cuentaPublicitariaId: string | null;
  campaniaId: string | null;
  idExternoCuenta: string | null;
  idExternoCampania: string | null;
  nombreCampania: string | null;
}

/**
 * Deviation from design (minimal, structural): el diseño tipa el parámetro
 * como `LeadEntrante` completo. Se estrecha a solo los 4 campos que la
 * función realmente lee — cualquier `LeadEntrante` real sigue satisfaciendo
 * este tipo sin cast (superconjunto estructural), y así
 * `deduplicacion.service.ts` puede invocarla con un objeto armado a mano
 * (sin los campos fijos de `LeadEntrante`) sin recurrir a un `as` inseguro.
 */
export type AtribucionEntrada = Pick<
  LeadEntrante,
  "bridgeId" | "idExternoCuenta" | "idExternoCampania" | "nombreCampania"
>;

/**
 * Nunca lanza — un miss en cualquiera de los dos pasos degrada esa FK a
 * `null` sin abortar la ingesta (spec, Scenario "Unknown campaign (no
 * match)").
 */
export async function resolverAtribucion(
  entrada: AtribucionEntrada,
  client?: PrismaClientOrTransaction,
): Promise<AtribucionResuelta> {
  const idExternoCuenta = entrada.idExternoCuenta ?? null;
  const idExternoCampania = entrada.idExternoCampania ?? null;
  const nombreCampania = entrada.nombreCampania ?? null;

  let cuentaPublicitariaId: string | null = null;
  let campaniaId: string | null = null;

  if (idExternoCuenta !== null) {
    const cuenta = await cuentaPublicitariaRepository.findByBridgeEIdExterno(
      entrada.bridgeId,
      idExternoCuenta,
      client,
    );
    cuentaPublicitariaId = cuenta?.id ?? null;

    // D6: la campaña solo se busca si la cuenta resolvió — sin cuenta
    // conocida no hay `cuentaPublicitariaId` contra el cual acotar la
    // búsqueda de campaña.
    if (cuentaPublicitariaId !== null && idExternoCampania !== null) {
      const campania = await campaniaRepository.findByCuentaEIdExterno(
        cuentaPublicitariaId,
        idExternoCampania,
        client,
      );
      campaniaId = campania?.id ?? null;
    }
  }

  return { cuentaPublicitariaId, campaniaId, idExternoCuenta, idExternoCampania, nombreCampania };
}
