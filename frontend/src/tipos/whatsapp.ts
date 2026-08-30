/**
 * Tipos compartidos con el backend para el flujo de conexión de WhatsApp
 * Business (Embedded Signup de Meta) -- ver
 * `docs/contrato-frontend-whatsapp-api_mat_04.md`, secciones 1-3. Solo el
 * flujo de conexión: mensajería/conversaciones (secciones 4-6 del contrato)
 * queda fuera de este módulo.
 */

/** Un número de WhatsApp Business descubierto en el Paso 2 (`GET /whatsapp/callback`). */
export interface WhatsAppNumero {
  wabaId: string;
  numeroTelefonoId: string;
  numeroDisplay: string;
  verifiedName: string | null;
}

/** Estado de una `WhatsAppConexion` ya persistida (Paso 3, `POST /whatsapp/conexion`). */
export type EstadoWhatsAppConexion = "ACTIVA" | "TOKEN_EXPIRADO" | "ERROR" | "INACTIVA";

/**
 * Forma exacta del objeto `conexion` devuelto por el Paso 3. El token de
 * acceso NUNCA aparece acá -- ni cifrado ni en claro (contrato, sección 3).
 */
export interface WhatsAppConexion {
  id: string;
  empresaId: string;
  numeroTelefonoId: string;
  numeroDisplay: string;
  wabaId: string;
  estado: EstadoWhatsAppConexion;
  creadoEn: string;
}
