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
| M4 — Ingesta y bridges | ⚠️ Parcial | P1: el endpoint genérico fija `GOOGLE_FORMS` aunque el bridge autenticado sea de otra red; P1: `LeadRecibido` conserva trazabilidad histórica al bridge, pero falta una atribución singular/canónica de fuente, cuenta y campaña en `Lead` y sus DTO; P1: falta el productor `TOKEN_POR_EXPIRAR`; P2: adaptadores LinkedIn y X pendientes |
| M5 — Gestión de leads | ⚠️ Implementado con brechas | P0: autoridad de cierre y límites asesor→vendedor pendientes de definición/corrección; P1: rango `hasta` termina a medianoche y no valida `desde <= hasta`; P2: `vista=activos\|cerrados` pendiente; P3: whitelist de `limite` pendiente |
| M6 — Asignación, traspaso y SLA | ⚠️ Implementado con contrato pendiente | El código permite un segundo traspaso por el asesor original y no exige `asesor_id` antes de entregar a vendedor; depende de cerrar las preguntas de producto del flujo TO-BE |
| M7 — Citas | ✅ Completo | — |
| M8 — Notificaciones y tiempo real | ⚠️ Implementado con productor pendiente | `TOKEN_POR_EXPIRAR` existe en el contrato, pero no tiene productor ni scheduler; la brecha se comparte con M4 |
| M9 — Dashboard y métricas | ✅ Completo | — |

**Lectura rápida:** todos los módulos tienen implementación, pero eso no equivale
a que M4–M6 estén cerrados funcionalmente. Las brechas P0/P1 de la tabla
siguiente afectan autorización, atribución o exactitud de datos y deben
resolverse antes de usar esta base para una evolución multiempresa. LinkedIn y X
dependen primero de corregir el contrato genérico y la atribución; implementarlos
antes duplicaría trabajo y perpetuaría datos sin atribución singular/canónica.

---

## Brechas verificadas y orden de corrección

Prioridades: **P0** bloquea el contrato de autorización; **P1** bloquea una
evolución multiempresa fiable; **P2** completa una capacidad funcional; **P3**
es endurecimiento del contrato existente.

| Prioridad | Módulo | Brecha verificada | Consecuencia actual | Dependencia / siguiente paso |
|---|---|---|---|---|
| P0 | M5/M6 | `canEdit` permite al responsable operativo cerrar desde cualquier etapa no terminal; antes del traspaso ese responsable puede ser un asesor. Además, `canTransfer` no impide que el asesor original vuelva a cambiar al vendedor. | El sistema no garantiza la separación de competencias asesor→vendedor que se evalúa para el TO-BE; los tests actuales preservan el comportamiento AS-IS. | Resolver autoridad de Venta/No Venta, evidencia de primer contacto y reasignación de vendedor en `docs/14-evolucion-multitenant.md`; después cambiar reglas y tests juntos. |
| P1 | M4 | `postIngestaGenerica` siempre usa `adaptGoogleForms`, que fija `redSocial = GOOGLE_FORMS`, aunque `requireBridgeKey` ya resolvió la red real del bridge. | Un bridge X o de sitio web quedaría atribuido como Google Forms. | Hacer que el adaptador genérico reciba la fuente autenticada antes de agregar X o sitio web. |
| P1 | M4/M5 | `LeadRecibido.bridgeId -> leadId` conserva trazabilidad histórica indirecta hacia el bridge. Sin embargo, `LeadEntrante` transporta cuenta y campaña mientras `Lead` y sus DTO no exponen una atribución singular/canónica de fuente, cuenta y campaña; el filtro usa `payload_original`. | La auditoría puede reconstruir el bridge desde la recepción, pero reportes, permisos por fuente y detalle operativo dependen de joins indirectos, JSON crudo o quedan sin dato. | Definir la atribución canónica y sus claves antes de la migración multiempresa; luego exponerla en los DTO de M5 sin eliminar la trazabilidad histórica de `LeadRecibido`. |
| P1 | M4/M8 | `CuentaPublicitaria.tokenExpiraEn` ya se persiste, pero no existe productor ni scheduler de `TOKEN_POR_EXPIRAR`. | El administrador conoce una revocación al fallar la verificación, pero no recibe la alerta preventiva prometida siete días antes. | Implementar productor idempotente por ventana de expiración y cubrir concurrencia. |
| P1 | M5 | `hasta` se coerciona desde `YYYY-MM-DD` a medianoche y se aplica con `lte`; tampoco existe validación `desde <= hasta`. | El último día seleccionado queda casi totalmente excluido y se aceptan rangos invertidos. | Reutilizar la normalización a fin de día y el `superRefine` ya aplicados por `metricasQuerySchema`. |
| P2 | M4/M8 | Un lead sin teléfono ni correo escribe `bridge_logs.ADVERTENCIA`, pero `registrarBridgeLog` solo crea notificaciones para nivel `ERROR`. | No se notifica a supervisores como exige `docs/05-bridges.md`; un log no equivale a una notificación. | Agregar un productor explícito para el destinatario correcto; no ampliar todos los logs `ADVERTENCIA` indiscriminadamente. |
| P2 | M5 | Falta `vista=activos|cerrados` en `GET /leads`. | F3 no puede implementar sus tabs con filtrado server-side. | Agregar schema + `buildWhere`; decidir el campo de fecha de la vista de cerrados. |
| P2 | M4 | LinkedIn y X siguen pendientes. | Cobertura de captación incompleta. | Ejecutar después de corregir origen y atribución; LinkedIn mantiene dependencia de aprobación externa. |
| P3 | M5 | `limite` acepta cualquier entero entre 1 y 100 en vez de 10/25/50/100. | Backend y frontend no comparten el mismo conjunto permitido, aunque el máximo ya está acotado. | Endurecimiento puntual del schema. |

---

El diario de PR/commit por módulo (M1-M9) que este documento conservaba se
retiró: `git log --follow` sobre `backend/src/**` recupera esa cronología
completa. Este documento mantiene solo el estado consolidado vigente.
