# 00 — Estado y autoridad de la documentación

Este documento indica **qué se puede usar como fuente de verdad hoy** y qué
archivos requieren verificación adicional. **Precisión (2026-08-28):** la
fundación técnica multi-tenant (`Empresa`/`Membresia`, RLS de Postgres
forzado, contexto de tenant por `AsyncLocalStorage`, CAS optimista) ya está
implementada y en producción — Bloques A, B y C cerrados (`052e811`, 894/894
tests). Lo que sigue siendo equivalente a single-company es el
**comportamiento funcional**: routing por empresa, autoridad de cierre por
membresía y dashboards jerárquicos. D0 es el único slice multi-tenant
**previo al despliegue** y solo hace visible el aislamiento empresarial ya
existente; Bloques D y E se ejecutan **después del despliegue**, y F queda
al final, sujeto además a su dependencia dura de secuencia (ver
`docs/blocks/d0-visualizacion-multitenant.md` y
`docs/blocks/d-routing-oportunidad.md`).

> **Estado:** vigente
>
> **Autoridad:** mapa de confianza documental; no sustituye al código ni a las
> reglas de negocio aprobadas.
>
> **Baseline documental reconciliado:** rama `test/gpt`, HEAD `3e8c70a`,
> 2026-08-28.
>
> **Evidencia técnica de cierre A-C:** commit `052e811`, 894/894 tests.

## Ruta rápida de revisión

1. Leer este documento para conocer el nivel de confianza de cada fuente.
2. Usar [`16-hallazgos-y-preguntas.md`](16-hallazgos-y-preguntas.md) como
   entrada ejecutiva de revisión cruzada. Sus hallazgos y decisiones D1–D14
   (ya resueltas) no constituyen por sí solos un contrato de implementación.
3. Consultar [`11-plan-integracion.md`](11-plan-integracion.md) para el estado
   implementado actual.
4. Usar [`01-alcance-mvp.md`](01-alcance-mvp.md) y
   [`02-reglas-negocio.md`](02-reglas-negocio.md) como baseline funcional v1,
   respetando sus reservas documentadas.
5. Para modelo, endpoints o comportamiento actual, verificar siempre
   `backend/prisma/schema.prisma`, las migraciones y el código cuando la tabla
   siguiente marque una fuente como no confiable o mixta.
6. Consultar [`14-evolucion-multitenant.md`](14-evolucion-multitenant.md) y
   [`15-benchmark-crm-y-roadmap.md`](15-benchmark-crm-y-roadmap.md) solo para
   discutir el TO-BE; ninguno autoriza implementación.

## Niveles de confianza

| Estado | Cómo debe usarse |
|---|---|
| **Vigente** | Puede guiar trabajo dentro de su autoridad declarada. |
| **Vigente con reservas** | Es útil, pero las brechas señaladas deben verificarse contra código o una decisión de producto. |
| **Mixto** | Combina estado actual con intención o historia; no debe usarse de forma aislada. |
| **No confiable** | No debe guiar implementación ni validación hasta corregirse. |
| **Histórico** | Conserva contexto, pero no describe el estado actual. |
| **Borrador TO-BE** | Sirve para decidir una evolución; no describe el AS-IS ni autoriza implementación. |

## Matriz de documentos

| Documento | Estado | Autoridad | Verificación y uso actual |
|---|---|---|---|
| `README.md` | Vigente | Entrada al repositorio y flujo Docker | Ruta operativa soportada y mapa de documentación. |
| `AGENTS.md` | Vigente | Políticas obligatorias para agentes | Define el AS-IS con fundación multi-tenant implementada y comportamiento funcional todavía equivalente a single-company; separa D0 pre-despliegue de D/E/F post-despliegue. |
| `docs/01-alcance-mvp.md` | Vigente con reservas | Baseline funcional del MVP v1 | Mezcla alcance comprometido con elementos todavía parciales como LinkedIn y X; la atribución normalizada de campaña/cuenta ya fue resuelta por Bloque A. No representa el target multi-tenant. |
| `docs/02-reglas-negocio.md` | Vigente con reservas | Reglas del embudo v1 | El AS-IS de traspaso en `NUEVO` y SLA fue reconciliado; autoridad de cierre, rol dual y reglas TO-BE siguen pendientes. |
| `docs/03-modelo-datos.md` | Vigente con reservas | Lectura resumida del modelo AS-IS | Regenerado desde `schema.prisma` hasta Bloque B (`Empresa`/`Membresia`); **no refleja los cambios de esquema de Bloque C** (columna `version` para CAS, políticas RLS, roles `crm_app`/`crm_bypass_jobs`, `empresaId` denormalizado en `Cita`/`LeadEvento`/`Notificacion`). `schema.prisma` y las migraciones mandan mientras esto no se regenere. |
| `docs/04-formularios-semaforo.md` | Vigente con reservas | Formularios y rúbrica fija v1 | Los formularios calificables y la rúbrica están alineados. El cierre no: la API fija `cerradoEn`, no acepta una fecha enviada por el cliente y Venta no admite `observaciones`; solo No Venta acepta `observacionCierre`. |
| `docs/05-bridges.md` | Vigente con reservas | Contrato funcional de captación | Cada sección está etiquetada Implementado/Diseño/Requisito contra el código real de `backend/src/adapters` y `backend/src/jobs`. |
| `docs/06-modulos-backend.md` | Vigente con reservas | Checklist técnico backend | Solo el estado consolidado y las brechas P0-P3 vigentes; el diario histórico por módulo quedó en Git (`git log --follow`). |
| `docs/07-modulos-frontend.md` | Vigente con reservas | Checklist técnico frontend | Solo el estado consolidado y las brechas P1-P3 vigentes; el diario de migración mock-a-real quedó en Git (`git log --follow`). |
| `docs/08-dashboard-kpis.md` | Vigente con reservas | Definiciones funcionales de KPIs | Los KPIs están implementados, pero no todos se calculan solo con `lead_eventos`; campaña se resuelve actualmente desde JSON. |
| `docs/09-linea-grafica-frontend.md` | Mixto | Línea visual aprobada | La paleta y principios siguen siendo referencia; estados de librerías y flujo de mockups contienen historia ya superada. |
| `docs/10-skills-agente-frontend.md` | Vigente | Inventario de skills frontend | Verificado 2026-08-27: las 12 skills listadas están instaladas en `.claude/skills/` — el conteo y la tabla son correctos, sin brecha pendiente. |
| `docs/11-plan-integracion.md` | Vigente | Snapshot de integración AS-IS | Resumen conciso verificado contra rutas, servicios y clientes HTTP actuales. El plan cronológico anterior queda en Git. |
| `docs/12-pruebas-manuales-qa.md` | No confiable | Catálogo histórico de escenarios QA | Sus fixtures no coinciden con los seeds actuales; no permite certificar QA hasta reconstruirse. |
| `docs/13-configuracion-bridges.md` | Vigente con reservas | Guía operativa de Meta y Google Forms | Es utilizable con verificación puntual de variables, modelo Facebook/Instagram y creación de cuentas. |
| `docs/14-evolucion-multitenant.md` | Mixto | Referencia TO-BE histórica con corte AS-IS explícito | Conserva alternativas y dirección de arquitectura, pero su corte AS-IS actualizado reconoce A-C como implementados. Holding como tenant es una decisión resuelta (D1, `docs/16` §8); no autoriza por sí solo los bloques pendientes. |
| `docs/15-benchmark-crm-y-roadmap.md` | Borrador TO-BE | Referencias de mercado y priorización futura | Compara capacidades con fuentes oficiales; sus recomendaciones no son requisitos aprobados ni prueba de implementación. |
| `docs/16-hallazgos-y-preguntas.md` | Vigente | Síntesis ejecutiva entre equipos de hallazgos y orden de decisiones | Es la entrada para revisión cruzada en el corte declarado. No reemplaza los contratos funcionales/técnicos ni autoriza implementación. Los fragmentos de esquema/diseño de D1-D14 viven en `docs/blocks/`. |
| `docs/17-seguridad-y-ciberseguridad.md` | Vigente | Política operativa para cambios sensibles | Separa controles AS-IS y gates TO-BE; consultar `docs/19` para evidencia auditada, riesgos y plan de pruebas. |
| `docs/18-desarrollo-local.md` | Vigente | Variables de entorno, comandos y estructura de carpetas | Migrado de `backend/README.md`/`frontend/README.md`; excluye ejecución en host. |
| `docs/19-auditoria-ciberseguridad.md` | Vigente con reservas | Informe consolidado de seguridad | Describe beneficios, hallazgos P0–P2, límites de la evidencia y pruebas pendientes; no autoriza cambios ni sustituye un pentest. |
| `docs/21-skills-agentes-backend.md` | Vigente | Inventario real de skills de backend | Regenerado desde `.claude/skills/` y `.agents/skills/` reales. |
| `docs/blocks/{a,b,c}-*.md` | Vigente | Bloques cerrados de la migración multi-tenant | A, B y C están implementados. Bloque C cerró en `052e811`, 894/894 tests. |
| `docs/blocks/d0-visualizacion-multitenant.md` | Vigente | Contrato del único slice multi-tenant pre-despliegue | Expone al frontend la separación por empresa que el backend ya resuelve, sin routing, autoridad, dashboards ni cambios Prisma. |
| `docs/blocks/d-routing-oportunidad.md` | Borrador TO-BE | Contrato post-despliegue de routing, autoridad y Oportunidad | Su ciclo SDD ya corrió y deberá ajustarse al calendario vigente antes de `apply`, no rehacerse. |
| `docs/blocks/e-dashboards.md` | Borrador TO-BE | Contrato post-despliegue de dashboards | No puede cerrar antes de D porque depende de `Oportunidad`/`Producto`. |
| `docs/blocks/f-retiro-legacy.md` | Borrador TO-BE | Retiro final de compatibilidad legacy | Último bloque post-despliegue; solo después de congelar o mergear el trabajo de `dev-back`/`dev-front` sobre `Usuario.rol`, nunca en paralelo. |

## Brechas abiertas confirmadas

| Brecha | Evidencia actual | Consecuencia |
|---|---|---|
| ✅ Atribución normalizada resuelta (Bloque A, WU4) | `Lead` ahora tiene `campaniaId` y `cuentaPublicitariaId` como FK resueltos; `atribucion.service.ts` resuelve en ingesta con degradación silenciosa a `null` si no hay match. Commit 07b1d40. | Resuelto — el listado y detalle pueden mostrar relación confiable de campaña/cuenta, y el filtrado puede usar las FKs en lugar de JSON. |
| Contrato de cierre divergente | Docs 02/04 exigen fecha de cierre en Venta/No Venta y docs/04 permite observaciones de Venta; el schema no recibe esos campos y el servicio fija `cerradoEn` con la hora del servidor. | Una interfaz o prueba basada en esos documentos enviaría datos descartados o no representables por el contrato actual. |
| Autoridad de cierre AS-IS implementada (Bloque A, WU1–WU2); corte D7 a autoridad real pendiente | Bloque A implementó `canClose` como regla AS-IS (sin multi-tenant): ADMINISTRADOR siempre cierra sin reassign, SUPERVISOR nunca cierra, responsable operativo cierra solo si es el asignado. Decisión D7 (multi-tenant + `habilitadoParaVenta`) está resuelta en `docs/16` §8; Bloque B implementó el andamiaje (`Membresia`, `habilitadoParaVenta`, comparador en sombra). **Confirmado (Bloque C ya cerrado):** su cutover bloqueante solo movió el scope de empresa a `Membresia` — la autoridad de rol en `leads.access.ts::canClose/canTransfer` sigue leyendo `Usuario.rol` legacy en su totalidad. El corte real es 100% alcance de Bloque D, diferido a después del despliegue. | Autoridad de cierre AS-IS funciona con `Usuario.rol`; el andamiaje de D7 ya existe pero no manda todavía. Rol dual (D5), reasignación (D9) y handoff (D8) también resueltos en D14, con corte de autoridad pendiente igual que D7, ahora con fecha diferida explícita. |
| ✅ Historial técnico retirado de documentos vivos | Docs 06/07 ya redujeron el diario extenso a checklists lean del estado consolidado (Lote 3, ver también `docs/16` §4.1). | Resuelto — la fuente vigente queda separada de la cronología, que sigue en Git. |
| QA no reproducible | Los usuarios, bridges, leads, citas y notificaciones de docs/12 no coinciden con `seed.ts` ni `seed-leads-qa.ts`; docs/12 se redujo a un índice con TODO explícito (2026-08-27) mientras el Lote 4 sigue abierto. | No se puede usar el checklist actual como evidencia de aceptación. |
| D15 (importación de leads históricos por empresa) sin bloque asignado | Documentado y diferido explícitamente en `docs/16` líneas 651-664 ("Pendiente, diferido... no bloquea Bloque C"); no tiene `docs/blocks/*.md` propio ni entrada previa en esta matriz. | Riesgo bajo hoy (no bloquea nada vigente), pero queda huérfano de seguimiento si no se recuerda al planificar bloques posteriores a F. |
| `mapLeadFromApi` no resuelve datos de contacto/campaña reales | `frontend/src/funcionalidades/leads/leads.api.ts::mapLeadFromApi` fija `correoPrincipal` y `campania` en `null`, aunque el backend ya resuelve `campaniaId`/`cuentaPublicitariaId` reales (Bloque A, WU4). | El listado y detalle de leads no muestran contacto ni campaña real en frontend pese a que el dato ya existe en backend. |
| M6 no exige `asesor_id` antes del handoff a vendedor | `backend/src/services/asignacion.service.ts` no valida que exista `asesor_id` antes de entregar el lead a vendedor (ver `docs/06`, módulo M6). | Un lead puede pasar a vendedor sin asesor asignado, dejando el historial de responsables incompleto. |
| Sin guard de edición local ni redirección 403 en detalle de lead | Falta guard de edición local en `LeadTimeline`/`FormularioEtapaLead` y redirección ante 403 en `LeadDetallePage`. | La UI puede intentar acciones que el backend rechaza sin feedback claro al usuario ni redirección automática. |

## Plan de corrección por lotes

Git conserva la cronología de qué se corrigió y cuándo (`git log --follow` por
archivo). Esta sección solo declara qué queda pendiente hoy.

### Lote 1 — Navegación y confianza documental

- [x] Crear este mapa de autoridad.
- [x] Dejar una única ruta feliz Docker en el README raíz.
- [x] Separar en AGENTS el baseline single-company del target multi-tenant.
- [x] Sustituir el plan histórico de integración por un snapshot vigente.
- [x] Bloquear el uso accidental de los documentos 03 y 12 mediante banners.

### Lote 2 — Contratos AS-IS exactos

- [x] Sincronizar `03-modelo-datos.md` con Prisma y migraciones.
- [x] Corregir `02-reglas-negocio.md` en traspaso y SLA.
- [ ] Reconciliar el contrato de cierre de docs 02/04 con el schema y servicio.
- [x] Separar requisitos y comportamiento implementado en `05-bridges.md`.
- [ ] Aclarar fuentes de datos reales en `08-dashboard-kpis.md` y
      `13-configuracion-bridges.md`.

### Lote 3 — Reducir historia y deuda de lectura

- [x] Convertir docs 06/07 en checklists concisos de estado actual.
- [x] Trasladar cronología, ramas y PRs a Git o a un archivo histórico
      explícito.
- [ ] Reconciliar la guía visual y los inventarios de skills con el repositorio.

### Lote 4 — QA reproducible

- [ ] Definir un único procedimiento de reset y seed para QA dentro de Docker.
- [ ] Hacer que los fixtures creados y los casos documentados coincidan.
- [ ] Ejecutar el checklist revisado y registrar evidencia real.

### Lote 5 — Evolución multi-tenant/holding

- [x] Crear un documento TO-BE separado del baseline v1.
- [x] Registrar el benchmark de mercado y una priorización inicial sin
      convertirla en contrato.
- [x] Resolver organización, empresa, membresías, roles, permisos por canal,
      ownership de bridges y alcance de métricas — ver D1, D4, D5, D6, D12 en
      `docs/16` §8.
- [ ] Aprobar migración, compatibilidad y estrategia de despliegue antes del
      corte final de autorización real y del retiro de columnas legacy
      (Bloque F). No aplica a la migración aditiva de Bloque B (`Empresa`,
      `Membresia`, sombra), ya aprobada y ejecutada vía SDD (commit
      `2526af7`).
- [x] Decisión de priorización (2026-08-28): Bloque D se divide en D0
      (visualización mínima pre-despliegue, sin migraciones ni archivos de
      alto riesgo) y D completo (routing/Oportunidad, diferido a después del
      despliegue). Bloque F queda con una dependencia de secuencia explícita
      — solo tras congelar/mergear el trabajo de `dev-back`/`dev-front`
      sobre `Usuario.rol` legacy, nunca en paralelo. Detalle en cada
      `docs/blocks/{d0,d,e,f}-*.md`.

## Regla de mantenimiento

Todo cambio futuro debe actualizar en el mismo work unit la regla de negocio,
el contrato técnico y la prueba que lo demuestra. Git conserva la cronología;
los documentos vivos deben mostrar el resultado vigente, no una secuencia de
parches históricos.
