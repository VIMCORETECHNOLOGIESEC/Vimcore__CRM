import type { Lead } from "@/tipos/lead";

/**
 * Lead de ejemplo del tutorial guiado de Leads (F3). El tour SIEMPRE usa este
 * lead mock, nunca el lead real de quien lo recorre -- incluso si tiene leads
 * asignados -- para no arriesgarse a mutar (o simplemente mostrar) datos
 * reales durante una demo guiada. Un solo camino de código para el tutorial:
 * `LeadsPage.tsx` (fila inyectada en la tabla mientras el tour está activo),
 * `useLeadDetalle.ts` (detalle y citas servidos localmente, sin red) y los
 * formularios de `detalle/` (envío deshabilitado, ver `esLeadDemo` en cada
 * uno) lo reconocen por `TUTORIAL_MOCK_LEAD_ID`.
 */
export const TUTORIAL_MOCK_LEAD_ID = "tutorial-demo-lead";

function daysAgo(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

function hoursAgo(horas: number): string {
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
}

/**
 * Sin correo (`correoPrincipal: null`) a propósito: el paso "Confirma datos y
 * origen" del tour (`LeadsNavigationTutorial.tsx`) explica explícitamente el
 * caso "el lead no tiene correo registrado" -- este lead demo es el único
 * dato que ese paso necesita para mostrarlo de verdad, en vez de describirlo
 * en abstracto.
 */
export const TUTORIAL_MOCK_LEAD: Lead = {
  id: TUTORIAL_MOCK_LEAD_ID,
  cliente: {
    id: "tutorial-demo-cliente",
    nombre: "Valeria Sosa",
    telefonoOriginal: "0991234567",
    telefonoNormalizado: "+593991234567",
    correoPrincipal: null,
    telefonoValido: true,
  },
  campania: { id: "tutorial-demo-campania", nombre: "Campaña Demo Instagram" },
  origen: "NUEVO",
  redSocial: "INSTAGRAM",
  etapa: "CONTACTADO",
  semaforo: "AMARILLO",
  puntuacion: 55,
  asesor: { id: "tutorial-demo-asesor", nombre: "Camila Reyes", rol: "ASESOR" },
  vendedor: null,
  slaInicioEn: hoursAgo(5),
  ingresadoEn: daysAgo(3),
  cerradoEn: null,
  cuentaPublicitaria: { id: "tutorial-demo-cuenta", nombre: "Cuenta Ads Demo" },
  camposDinamicos: { Interés: "Planes de crédito", Ciudad: "Cuenca" },
  montoVenta: null,
  productoVendido: null,
  formaPago: null,
  observacionCierre: null,
};
