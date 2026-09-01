# Handoff Meta Ads (estado de conexión + métricas de campaña) — estado actual (2026-09-01)

> **Material de coordinación:** explica un gap encontrado en una auditoría de
> paridad backend↔frontend y el plan para cerrarlo. No reemplaza a
> `docs/00-estado-documentacion.md` ni al código. Rama de trabajo: `test/gpt`.
> **Nada de lo descrito acá está implementado todavía** — es diagnóstico +
> plan aprobado, pendiente de ejecución por quien retome esto.

## Origen: auditoría de paridad backend↔frontend

Se recorrieron las 20 rutas de `backend/src/routes/*.ts` contra
`frontend/src/**/*.ts(x)` buscando endpoints de backend sin ningún
consumidor real. De ~20 módulos, solo 2 endpoints de métricas quedaron sin
consumir:

1. `GET /metricas/rendimiento-campanias` (CPC/CPL/CAC reales de Meta Ads por
   campaña, `metricas.service.ts::getRendimientoCampanias`) — gap real, plan
   abajo.
2. `GET /metricas/por-habilitado-para-venta` — **en stand by**, ver sección
   siguiente.

Todo el resto (bridges, canales manuales, citas, apariencia/configuración de
empresa, leads, usuarios de empresa, LinkedIn, oportunidades/productos,
reportes, WhatsApp/conversaciones, notificaciones) ya tiene consumidor
confirmado. Sin dudas pendientes de esa auditoría.

## `GET /metricas/por-habilitado-para-venta` — EN STAND BY, no implementar todavía

Decisión explícita del usuario (2026-09-01): dado el tiempo de
producción/presentación, este gap se congela. Motivo de fondo — **no es un
problema nuevo, ya está documentado** en `docs/00-estado-documentacion.md`
(entrada "Autoridad de cierre AS-IS implementada") y resuelto a nivel de
diseño en `docs/16-hallazgos-y-preguntas.md` §8: el corte real de autoridad
que usaría `habilitadoParaVenta` para bloquear que un Asesor sin membresía de
venta cierre una venta completa es **100% alcance de Bloque D, diferido a
después del despliegue** — `leads.access.ts::canClose/canTransfer` hoy sigue
leyendo `Usuario.rol` legacy en su totalidad, no `Membresia.habilitadoParaVenta`.
Implementar la métrica de dashboard sin ese corte de autoridad mostraría un
desglose sobre una regla de negocio que todavía no se aplica de verdad — por
eso queda en stand by junto con el resto de Bloque D, no es una omisión.

## Meta Ads — gap real: falta el estado de conexión persistente

Comparación completa contra `whatsapp/ConectarWhatsAppCard.tsx` (ya resuelto
de punta a punta, ver siguiente sección) usando `codegraph_explore` +
lectura directa de:
`frontend/src/funcionalidades/metaAds/{ConectarMetaAdsCard.tsx,MetaAdsConexionOverlay.tsx,useMetaAds.ts}`.

### Qué ya está bien (no tocar)

- `MetaAdsConexionOverlay.tsx` — overlay bloqueante correcto: `inert` en
  `#root` mientras el popup está abierto/verificando, estados
  `waiting → verifying → connected|notConnected`, nunca asume resultado por
  el solo cierre del popup — siempre consulta el estado real contra el
  backend (`useMetaAdsConexionStatus`, Paso 4 del flujo,
  `GET /meta-ads/conexion`).
- `useOAuthPopup` (`frontend/src/hooks/useOAuthPopup.ts`) — infra genérica
  compartida con WhatsApp, sin cambios necesarios.
- Fallback a redirect de página completa si el navegador bloquea el popup —
  ya implementado.

### Qué falta

A diferencia de `ConectarWhatsAppCard.tsx`, que monta
`useWhatsAppEstadoActual` (query persistente, revalida cada 60s mientras
`estado === "ACTIVA"`) y muestra un indicador visual (`PuntoEstadoActivo` +
"Conectado a {número}"), **`ConectarMetaAdsCard.tsx` no tiene ningún
equivalente**:

- No existe `useMetaAdsEstadoActual` en `useMetaAds.ts` (solo está
  `useMetaAdsConexionStatus`, la mutation de un solo uso del Paso 4).
- La tarjeta siempre muestra el botón "Conectar Meta Ads", incluso después
  de una conexión exitosa — no hay forma de ver desde Bridges si ya está
  conectado sin volver a intentar conectar.
- `closeOverlay()` en `ConectarMetaAdsCard.tsx` no refresca nada (`WhatsApp`
  sí: `void estadoActual.refetch()` al cerrar el overlay).

### Plan (aprobado, sin implementar)

1. `useMetaAdsEstadoActual` en `useMetaAds.ts` — mirror exacto de
   `useWhatsAppEstadoActual` (`useWhatsApp.ts`): `useQuery` montada con la
   tarjeta, `queryFn: () => fetchMetaAdsConexionApi(empresaId)`,
   `refetchInterval` de 60s solo si `estado === "ACTIVA"`.
2. `ConectarMetaAdsCard.tsx` — mostrar `PuntoEstadoActivo` + texto "Conectado"
   cuando `estadoActual.data?.estado === "ACTIVA"` (mismo patrón exacto que
   WhatsApp, reusar `PuntoEstadoActivo` de
   `frontend/src/funcionalidades/whatsapp/PuntoEstadoActivo.tsx` o duplicarlo
   a `metaAds/` si se prefiere no cruzar carpetas — a decidir por quien
   implemente). `closeOverlay()` agrega `void estadoActual.refetch()`.
3. Dashboard — nueva tarjeta de "rendimiento de campañas" (CPC/CPL/CAC)
   consumiendo `GET /metricas/rendimiento-campanias`, condicionada al mismo
   `useMetaAdsEstadoActual`: si no está conectado, estado vacío con CTA a
   Bridges en vez de pedir la métrica (mismo criterio que
   `WhatsAppSinConexion.tsx`, ya implementado para el panel de WhatsApp del
   detalle de lead — ver `docs/claude-despliegue-produccion-estado-actual.md`
   si existe una entrada más reciente que ésta al momento de leer esto).

## WhatsApp — confirmado correcto, bloqueo conocido de infraestructura

`ConectarWhatsAppCard.tsx` ya implementa el flujo completo (overlay +
indicador persistente + refetch al cerrar) — no requiere ningún cambio de
código. El único bloqueo, ya documentado en el propio docblock del
componente y en `docs/claude-bridgeapi-whatsapp-estado-actual.md`:
`WHATSAPP_OAUTH_REDIRECT_URI` (backend) apunta hoy al backend mismo, no al
frontend, así que el popup nunca llega a `WhatsAppCallbackPage` y el Paso 4
(`GET /whatsapp/conexion`) siempre devuelve "no conectado" sin importar el
resultado real en Meta. El mismo código ya escrito empieza a funcionar solo
el día que se corrija esa URL en el entorno — no es una tarea de código.

## Pendiente de verificar (no pude confirmarlo yo)

**`META_ADS_OAUTH_REDIRECT_URI`** — no se pudo leer `.env`/`.env.example`
desde esta sesión (bloqueado por permisos del sandbox). Antes de dar por
buena la implementación del plan de arriba, confirmar que esta variable
apunta al frontend y no al backend — si tiene el mismo problema que
`WHATSAPP_OAUTH_REDIRECT_URI` (ver sección anterior), el paso 1-2 del plan
va a quedar igual de enmascarado (siempre "no conectado") hasta corregir la
URL en el entorno, independiente de que el código esté bien.
