import type { RedSocial } from "@prisma/client";

/**
 * Contrato interno de ingesta (docs/05-bridges.md §2): todo adaptador
 * entrega esta forma. Un campo que no se puede llenar es `null`, nunca un
 * valor por defecto inventado (Requirement: LeadEntrante contract).
 *
 * `DeduplicacionInput` (`services/deduplicacion.service.ts`) es un
 * subconjunto estructural exacto de los campos fijos de abajo — M4 pasa un
 * `LeadEntrante` completo sin adaptación adicional (docs/05-bridges.md §2,
 * "Idempotencia").
 */
export interface LeadEntrante {
  redSocial: RedSocial;
  bridgeId: string;

  // Campos fijos
  nombre: string | null;
  telefono: string | null; // sin normalizar
  correo: string | null; // sin alterar

  // Atribución
  idExternoLead: string; // idempotencia
  idExternoCampania: string | null;
  nombreCampania: string | null;
  idExternoCuenta: string | null;

  // Resto del formulario
  camposDinamicos: Record<string, unknown>;

  ingresadoEn: Date; // marca de tiempo de la plataforma
  payloadOriginal: unknown;
}
