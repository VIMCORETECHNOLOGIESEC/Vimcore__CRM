# 06 — Módulos backend y checklist de avance

Marca cada casilla al completar el ciclo TDD (RED → GREEN → TRIANGULATE →
REFACTOR) del elemento. Un módulo no está terminado hasta que su columna de
pruebas obligatorias está cubierta.

Estructura por módulo: `routes/ → controllers/ → services/ → repositories/`

---

## Estado consolidado (revisión estática contra código real, 2026-08-25)

| Módulo | Estado | Pendientes |
|---|---|---|
| M1 — Base e infraestructura | ✅ Completo | — |
| M2 — Autenticación y usuarios | ✅ Completo | — |
| M3 — Normalización y deduplicación | ✅ Completo | — |
| M4 — Ingesta y bridges | ⚠️ Parcial | ✅ CERRADO (Bloque A, 2026-08-26): `redSocial` del bridge, atribución canónica cuenta/campaña, productor `TOKEN_POR_EXPIRAR`. Pendiente: P2 adaptadores LinkedIn y X |
| M5 — Gestión de leads | ⚠️ Implementado con brechas | ✅ CERRADO (Bloque A, 2026-08-26): autoridad de cierre (`canClose`), rango `hasta`/`desde`, `vista=activos\|cerrados`, whitelist de `limite` |
| M6 — Asignación, traspaso y SLA | ✅ Completo | ✅ CERRADO (Bloque A, 2026-08-26): el asesor original ya no puede volver a traspasar un lead ya traspasado (`ya_traspasado`). ✅ CERRADO (backend, 2026-08-30): `canTransfer` exige `asesorId != null` para la excepción de acceso total (Admin/Supervisor/holding) — motivo nuevo `sin_asesor_previo`, mapeado a `AppError("traspaso_sin_asesor", 409, ...)` en `asignacion.service.ts::throwForMotivoDenegacion`. Además, `deactivateUsuario` (baja lógica de usuario) ahora reasigna la cartera de `Lead` por las DOS columnas FK reales (`asesorId`/`vendedorId`) vía `Membresia`/`habilitadoParaVenta`, no por el enum legado `Usuario.rol` — cerraba huérfana la cartera de un asesor habilitado para venta que tenía leads en ambos pools a la vez. |
| M7 — Citas | ✅ Completo | — |
| M8 — Notificaciones y tiempo real | ⚠️ Implementado con productor pendiente | ✅ CERRADO (Bloque A, 2026-08-26): productor `TOKEN_POR_EXPIRAR` implementado (compartido con M4); notificación `LEAD_DATO_INCOMPLETO` a supervisores activos |
| M9 — Dashboard y métricas | ✅ Completo | — |

**Lectura rápida:** Bloque A (M-hardening single-company, 2026-08-26) cerró las
8 brechas P0–P3 de autorización, atribución y exactitud de datos que esta
tabla señalaba como bloqueantes de una evolución multiempresa (ver detalle
fila por fila abajo). El requisito de M6 de exigir `asesor_id` antes de
entregar a vendedor se cerró el 2026-08-30 (ver fila M6 y P0 M5/M6 abajo).
Solo queda abierto el P2 de adaptadores LinkedIn y X (fuera del alcance de
Bloque A).

---

## Brechas verificadas y orden de corrección

Prioridades: **P0** bloquea el contrato de autorización; **P1** bloquea una
evolución multiempresa fiable; **P2** completa una capacidad funcional; **P3**
es endurecimiento del contrato existente.

| Prioridad | Módulo | Brecha verificada | Consecuencia actual | Dependencia / siguiente paso |
|---|---|---|---|---|
| P0 | M5/M6 | `canEdit` permite al responsable operativo cerrar desde cualquier etapa no terminal; antes del traspaso ese responsable puede ser un asesor. Además, `canTransfer` no impide que el asesor original vuelva a cambiar al vendedor. | El sistema no garantiza la separación de competencias asesor→vendedor que se evalúa para el TO-BE; los tests actuales preservan el comportamiento AS-IS. | ✅ CERRADO (Bloque A, WU1+WU2, 2026-08-26): `canClose` nueva función de autoridad de cierre (gate de etapa primero, sin excepción de rol — memoria #82) wired en `transitionEtapa`; `canTransfer` deniega `ya_traspasado` cuando `vendedorId != null`. Resuelto en `backend/src/services/leads.access.ts`/`leads.service.ts`. |
| P0 | M6 | "Admin y supervisor pueden entregar a vendedor un lead sin asesor" (docs/16-hallazgos-y-preguntas.md §4.4): `canEdit` deja a Admin/Supervisor avanzar la etapa de un lead sin `asesorId` (no exige titularidad), y la excepción de acceso total de `canTransfer` no exigía `asesorId != null` antes de permitir el traspaso a vendedor. | Un lead podía llegar a un vendedor sin que ningún asesor lo hubiera gestionado — se omitía la intervención inicial requerida por D9/docs/02. | ✅ CERRADO (backend, 2026-08-30): `canTransfer` ahora deniega con `sin_asesor_previo` (409 `traspaso_sin_asesor`) si `asesorId === null`, incluso para ADMINISTRADOR/SUPERVISOR/SUPERVISOR_HOLDING/SUPER_ADMIN. Resuelto en `backend/src/services/leads.access.ts`/`asignacion.service.ts`. Tests: `tests/leads.access.asignacion.test.ts`, `tests/asignacion.routes.test.ts`. |
| P1 | M4 | `postIngestaGenerica` siempre usa `adaptGoogleForms`, que fija `redSocial = GOOGLE_FORMS`, aunque `requireBridgeKey` ya resolvió la red real del bridge. | Un bridge X o de sitio web quedaría atribuido como Google Forms. | ✅ CERRADO (Bloque A, WU3, 2026-08-26): `adaptGoogleForms` recibe `redSocial` como parámetro (`req.bridge.redSocial`) en vez de la constante fija. |
| P1 | M4/M5 | `LeadRecibido.bridgeId -> leadId` conserva trazabilidad histórica indirecta hacia el bridge. Sin embargo, `LeadEntrante` transporta cuenta y campaña mientras `Lead` y sus DTO no exponen una atribución singular/canónica de fuente, cuenta y campaña; el filtro usa `payload_original`. | La auditoría puede reconstruir el bridge desde la recepción, pero reportes, permisos por fuente y detalle operativo dependen de joins indirectos, JSON crudo o quedan sin dato. | ✅ CERRADO (Bloque A, WU4, 2026-08-26): `Lead.cuentaPublicitariaId`/`campaniaId` (FK, `ON DELETE SET NULL`) + escalares crudos, resueltos por `atribucion.service.ts::resolverAtribucion` (lookup de dos pasos, degrada a `null` sin fallar la ingesta). Migración `20260826120100_bloque_a_atribucion_lead`. |
| P1 | M4/M8 | `CuentaPublicitaria.tokenExpiraEn` ya se persiste, pero no existe productor ni scheduler de `TOKEN_POR_EXPIRAR`. | El administrador conoce una revocación al fallar la verificación, pero no recibe la alerta preventiva prometida siete días antes. | ✅ CERRADO (Bloque A, WU5, 2026-08-26): `producirAlertaTokenPorExpirar` (idempotente vía `CuentaPublicitaria.alertaExpiracionParaEn`), registrado en `scheduledNotificationProducers.tokenPorExpirar`. Migración `20260826120200_bloque_a_alerta_expiracion_token`. |
| P1 | M5 | `hasta` se coerciona desde `YYYY-MM-DD` a medianoche y se aplica con `lte`; tampoco existe validación `desde <= hasta`. | El último día seleccionado queda casi totalmente excluido y se aceptan rangos invertidos. | ✅ CERRADO (Bloque A, WU6, 2026-08-26): `hasta` normaliza a fin de día UTC (`finDiaUTC`, mismo patrón que `metricas.schema.ts`) + `superRefine` rechaza `desde > hasta`. |
| P2 | M4/M8 | Un lead sin teléfono ni correo escribe `bridge_logs.ADVERTENCIA`, pero `registrarBridgeLog` solo crea notificaciones para nivel `ERROR`. | No se notifica a supervisores como exige `docs/05-bridges.md`; un log no equivale a una notificación. | ✅ CERRADO (Bloque A, WU7, 2026-08-26): `ingesta.service.ts::procesarRecepcion` notifica `LEAD_DATO_INCOMPLETO` a los SUPERVISOR activos dentro de la misma transacción (uno por lead, sin agregación) — deliberadamente NO en `registrarBridgeLog`, para no capturar el `ADVERTENCIA` no relacionado de `bridge-mudo.service.ts`. Migración de enum `20260826120000_bloque_a_tipo_notificacion_lead_dato_incompleto`. |
| P2 | M5 | Falta `vista=activos|cerrados` en `GET /leads`. | F3 no puede implementar sus tabs con filtrado server-side. | ✅ CERRADO (Bloque A, WU8, 2026-08-26): `vista` en `listLeadsQuerySchema` + `buildWhere`; `vista=cerrados` + `estadoSla` se rechaza explícitamente (contradicción). |
| P2 | M4 | LinkedIn y X siguen pendientes. | Cobertura de captación incompleta. | Ejecutar después de corregir origen y atribución; LinkedIn mantiene dependencia de aprobación externa. (Fuera del alcance de Bloque A — sigue abierto.) |
| P3 | M5 | `limite` acepta cualquier entero entre 1 y 100 en vez de 10/25/50/100. | Backend y frontend no comparten el mismo conjunto permitido, aunque el máximo ya está acotado. | ✅ CERRADO (Bloque A, WU9, 2026-08-26): whitelist `{10,25,50,100}` vía `.refine`, default `25`; tipo `ListLeadsQuery["limite"]` se mantiene `number` (D8) para no romper fixtures existentes. |

---

El diario de PR/commit por módulo (M1-M9) que este documento conservaba se
retiró: `git log --follow` sobre `backend/src/**` recupera esa cronología
completa. Este documento mantiene solo el estado consolidado vigente.

---

## Archivos de alto riesgo — coordinar antes de tocar en paralelo

Archivos transversales donde un cambio de bloque en curso puede colisionar
con otro si se tocan al mismo tiempo sin coordinación:

| Archivo | Motivo |
|---|---|
| `backend/prisma/schema.prisma` | Único archivo; cada bloque nuevo le agrega modelos → conflicto de migración si se toca en paralelo |
| `backend/src/lib/event-broker.ts` | Hub SSE transversal, 24 símbolos dependientes de `publish` |
| `backend/src/services/leads.access.ts` | Autoridad `canEdit`/`canTransfer`. Bloque C (cerrado) ya reescribió el scope de empresa; la autoridad de rol (`Usuario.rol` → `Membresia`) sigue pendiente, es alcance de Bloque D |
| `backend/src/lib/jwt.ts` + middlewares de rol | Transversal a toda ruta protegida; 17 archivos backend siguen referenciando `RolUsuario` (retiro real es Bloque F) |
| `frontend/src/api/httpClient.ts` | Cliente HTTP único, 8 módulos de negocio dependen directo |
| `frontend/src/router.tsx` + `frontend/src/layouts/navigation.ts` | Edición obligatoria por cada módulo nuevo → colisión de merge frecuente aunque trivial |

**Coordinar vs. bloqueante de secuencia (2026-08-28):** para Bloques D y E,
esta tabla es una lista de "avisar antes de editar" — D3/D7/D13 exigen editar
`leads.access.ts` y `asignacion.service.ts`, no hay forma de implementar esa
funcionalidad sin tocarlos, así que el conflicto de merge de contenido es un
costo de coordinación aceptado. Para Bloque F, `jwt.ts` + middlewares de rol
es distinto: retirar `Usuario.rol` mientras otro developer sigue escribiendo
código contra ese mismo enum no es un conflicto de merge coordinable con un
aviso — es una dependencia dura de secuencia. Ver
`docs/blocks/f-retiro-legacy.md`.
