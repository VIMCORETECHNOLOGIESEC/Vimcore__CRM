# 23 — Núcleo esencial multi-tenant y catálogo de módulos

> **Estado:** vigente — redefine el reparto de `docs/21` y `docs/22` bajo
> un criterio distinto: **esencial primero, complejo después y anotado**.
> No descarta esos documentos (siguen como historial de alternativas
> evaluadas); este es el reparto que se sigue desde ahora.
>
> **Verificado contra:** rama `test/gpt`, commit `0a6fe0d`, 2026-08-27.

## Idea central

Un solo dev — el **orquestador** — lleva la columna vertebral del
multi-tenant (lo mínimo para que el aislamiento entre empresas funcione de
punta a punta) sin distraerse en features. Los otros dos devs trabajan un
**catálogo de módulos** independiente de esa columna: cada módulo lista
sus actividades de back y de front, y si depende de algo que el
orquestador todavía no cerró, se define un **contrato mock** para
construirlo ya y enchufarlo después sin rehacerlo.

Los módulos que no son esenciales para probar que el multi-tenant
funciona (reportes reales, matriz de excepciones avanzada) se difieren
completos, con su punto de integración anotado — no se tocan ahora.

## 1. Columna vertebral — orquestador (1 dev)

```
C (cerrar RLS) → D esencial (Oportunidad/Producto + pool por empresa) → F esencial (retiro legacy)
```

| Etapa | Alcance esencial (lo que entra) | Lo que se deja fuera, para después |
|---|---|---|
| **C — cierre** | Grupo 4 (notificación al agotar CAS) + Grupo 6 (suite adversarial) — gate de aceptación de aislamiento | — (nada se difiere acá, es seguridad) |
| **D — esencial** | Modelos `Oportunidad`/`Producto`, pool de asignación scopeado por empresa (D3/D4), autoridad de cierre D7, split Lead/Oportunidad (D13), decisión registrada del riesgo `asesorId` | `CanalManual` (canal de ingreso manual), matriz de excepciones D9, granularidad fina de D14 — pasan al catálogo de módulos diferidos |
| **F — esencial** | `NOT NULL` en ownership por empresa, retiro de `Usuario.rol`/`enum RolUsuario`, validación de backup/rollback | Deprecación formal de endpoints v1 con consumidores activos (se agenda aparte si aparecen) |

Al cerrar esta columna, el criterio de "multi-tenant funciona" queda
cumplido: empresas aisladas, negociaciones múltiples por cliente por
empresa, sin compatibilidad legacy colgando.

## 2. Catálogo de módulos — independientes (empezar ya, sin mock)

### Integraciones de captación (LinkedIn / X)
- **Back:** `backend/src/adapters/linkedin.adapter.ts`, `x.adapter.ts`
  (patrón `meta.adapter.ts`); alta en el dispatch de `ingesta.service.ts`.
- **Front:** reactivar las opciones comentadas en
  `frontend/src/funcionalidades/bridges/catalogos.ts`.
- **Independencia:** total. No toca `Lead` ni `Oportunidad`; sobrevive
  intacto al cierre de Bloque D.

### Datos de contacto en listado/detalle
- **Front:** fix de `mapLeadFromApi` en
  `frontend/src/funcionalidades/leads/leads.api.ts` — resolver
  `correoPrincipal`/`campania` reales en vez de `null`.
- **Back:** ninguno (ya resuelto en Bloque A, WU4).
- **Independencia:** total. `campaniaId` se queda en `Lead` según el
  propio diseño de Bloque D — este fix no se retrabaja.

## 3. Catálogo de módulos — dependientes, con mock definido

### Autoridad de cierre de negociación
- **Depende de:** Bloque D — los campos de cierre (`montoVenta`,
  `observacionCierre`, `formaPago`, `cerradaEn`) migran de `Lead` a
  `Oportunidad`.
- **Mock a construir ahora:** tipar el contrato de cierre en frontend
  contra el modelo `Oportunidad` ya documentado en
  `docs/blocks/d-routing-oportunidad.md`, con fixture local
  (`msw` o similar) en vez de pegarle al endpoint actual de `Lead`.
- **Front:** `frontend/src/funcionalidades/leads/detalle/
  CierreVentaForm.tsx`, `cierre.schemas.ts`.
- **Back:** ninguno todavía — el mock se reemplaza por el endpoint real
  cuando el orquestador cierre D esencial.
- ⚠️ Hacerlo directo sobre `Lead` hoy es retrabajo garantizado — evitarlo.

### Guard de edición y sesión en detalle de lead
- **Depende de:** `backend/src/services/leads.access.ts`
  (`canEdit`/`canTransfer`), reescrito tanto por Bloque C como por D.
- **Mock a construir ahora:** interfaz `AutorizacionEdicion { puedeEditar,
  puedeTransferir, motivo }` consumida vía un hook
  (`useAutorizacionLead`) que hoy pega contra el endpoint actual — mañana
  solo cambia la fuente de datos del hook, no el contrato que ya consume
  la UI.
- **Front:** `LeadTimeline.tsx`, `FormularioEtapaLead.tsx`,
  `LeadDetallePage.tsx` (guard de edición + redirección ante 403).
- **Back:** ninguno nuevo por ahora.

### Canal de ingreso manual (`CanalManual`)
- **Depende de:** Bloque D — modelo `CanalManual` y endpoint de alta
  manual (`docs/blocks/d-routing-oportunidad.md` §"Canal de ingreso
  manual").
- **Complejidad:** se marca **diferido dentro de D** — no es esencial
  para probar aislamiento multi-tenant, es una fuente de leads adicional.
- **Mock a construir ahora:** UI de "Cargar lead manual" + administración
  del catálogo de canales, contra el shape ya especificado
  (`nombre`, `activo`, `empresaId`) con datos fixture; wiring real cuando
  el orquestador agregue el endpoint.

## 4. Módulos complejos diferidos (anotados, se integran al cerrar el núcleo)

### Reportes y métricas reales (antes Bloque E)
- **Depende de:** núcleo esencial completo (D para el embudo de
  Oportunidad, C para la autorización por empresa — ya lista).
- **Por qué se difiere:** sync real con Meta Marketing API,
  `CampaniaMetricaDiaria`, exportación PDF/XLSX, `ReporteJob` asíncrono —
  alto esfuerzo, no bloquea que el producto funcione multi-tenant.
- **Anotación de integración:** el esquema completo ya está documentado
  en `docs/blocks/e-dashboards.md` (`CampaniaMetricaDiaria`,
  `ConfiguracionReporte`, `ReporteJob`) — al retomarlo, se implementa
  directo desde ahí, sin rediseño.
- **Mock opcional si algún dev queda libre:** maquetas de UI de reportes
  (botón "Generar", progreso SSE) desconectadas de `router.tsx`.

### Matriz de competencia asesor-vendedor avanzada (excepciones D9)
- **Depende de:** D esencial (pool scopeado) ya cerrado.
- **Por qué se difiere:** la versión esencial de D7 (solo el asesor
  habilitado y responsable cierra) alcanza para operar. Las excepciones
  manuales auditadas de Administrador/Supervisor (D9) se agregan en una
  segunda pasada sin bloquear el cierre de D.

## 5. Reparto sugerido

- **Orquestador (Dev 1):** sección 1, de punta a punta. Único que toca
  `schema.prisma`, `event-broker.ts`, `leads.access.ts` (implementación
  real) y el módulo de auth.
- **Dev 2:** módulos independientes primero (Integraciones de captación,
  Datos de contacto), luego los dependientes-con-mock de UI (Guard de
  edición, Canal manual).
- **Dev 3:** módulo de cierre de negociación (mock) + QA reproducible
  (`docs/22` Track 3) mientras no haya nada más urgente; disponible para
  adelantar maquetas de Reportes si su cola se vacía antes que el
  orquestador cierre D.

## 6. Corrección sobre `docs/22`

`docs/22` había listado el fix del contrato de cierre y la validación de
`asesor_id` como ítems independientes de bloques. Revisando el diseño real
de Bloque D, el primero **sí depende de D** (los campos de cierre migran a
`Oportunidad`) y pasa a la sección 3 de este documento con su mock
definido. El segundo (`asesor_id` antes de entregar a vendedor) también
queda afectado porque D reconstruye el pool de asignación sobre
`Oportunidad` — se difiere dentro de la implementación esencial de D en
vez de parchearse aparte.
