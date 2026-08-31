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
> **Baseline documental reconciliado:** rama `test/gpt`, HEAD `ba3a4f5`
> (= `origin/test/gpt`), 2026-08-30 — barrido ampliado sobre toda la
> documentación, no solo este documento y `docs/23`. Verificación E2E manual
> contra producción real en curso (backend en Azure Container Apps, `/salud`
> OK); encontró y corrigió un bug real en `marca-publica.api.ts` (ver fila de
> `docs/23` abajo) — **sin commitear todavía** al momento de este barrido.
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
| `docs/09-linea-grafica-frontend.md` | Mixto | Línea visual — paleta base reemplazada (2026-08-28) | §3 registra la decisión: "Propuesta B" (índigo, `frontend/src/temas/variante-empresarial/`) reemplaza la paleta blanco/negro como línea gráfica base del proyecto. Principios de §2 y flujo de mockups siguen vigentes; historia de librerías en §4-6 no reconciliada con este cambio todavía. |
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
| `docs/22-contrato-backend-meta-ads.md` | Vigente con reservas | Contrato backend de Meta Ads Marketing API y métricas CPC/CPL/CAC | Derivado del código y tests locales del módulo `metaAds`; la verificación real contra Meta queda pendiente por bloqueo externo de SMS/App Review. |
| `docs/23-alcance-funcional-manual-tecnico.md` | Vigente, en progreso | Insumo de pantallas/funcionalidades para el manual técnico/de usuario | Inventario de 34 pantallas con estado (implementado/en desarrollo/pendiente/UI sin conexión) y pasos de uso reales o esperados; se completa con capturas a medida que cada pantalla se estabiliza, no espera al cierre del proyecto. **Reconciliado contra `origin/test/gpt` y código real el 2026-08-30**: bridgeApi, LinkedIn y el gestor de empresas (listado/cards/salir de vista) pasaron a ✅ tras verificar commits (`3fa8ea1`, `ac906c9`, `23069cd`, `18752ee`, `10f6dcb`, `1b43c8f`) y ausencia de mocks en el código; WhatsApp Business real quedó explícitamente partido en Parte 1 ✅ (`e684eee`) y Parte 2 congelada sin commitear, pendiente de que el usuario coordine alcance con Mateo (`AGENTS.md` §7); Oportunidad se marcó 🚧 (en desarrollo por otra sesión, confirmado sin commitear vía `git status`); "Detalle de empresa" quedó en 🚧 porque el gestor todavía no enlaza a esa pantalla y el filtro por `empresaId` sigue sin aplicarse en el servidor. El estado de backend de cada ítem (jobs de polling, webhook de LinkedIn, filtro `empresaId`) queda pendiente de que Mateo lo confirme — este documento solo verificó el lado frontend/código y git. **Segunda reconciliación (2026-08-30)**: extensiones de dashboard de Oportunidad (ítem 13, `e1f2dca`) y módulo de Oportunidad/Bloque D (ítem 17, `0a0ab91`) pasaron a ✅ tras verificar que ambos commits ya están en `origin/test/gpt` y que la excepción de alcance de `AGENTS.md` §7 (Bloque D/E adelantados por indicación del usuario) está documentada. WhatsApp Parte 2 sigue congelada sin commitear, no se tocó. **Tercera reconciliación (2026-08-30, esta sesión)**: exportación de reportes (ítem 15, `c8f80a5`), dashboard con filtro por empresa (ítem 14, `33968fe`), alta de administrador de empresa y tab holding-wide (ítems 23/25, `a63553c`) y detalle de empresa con filtro real (ítems 28/29, `1ce7359`) ya estaban ✅ en `docs/23` al momento de este barrido — confirmado contra `git log` y el código real, sin discrepancias. Se agregó a `docs/23` ítem 1 la descripción del boot pre-login vía `GET /marca-publica` y el bug de body `null` encontrado en verificación E2E (fix sin commitear en el worktree); se corrigió la nota técnica del ítem 30 (`POST /empresas` ya existe en backend, solo falta UI de frontend).

**Cuarta reconciliación (2026-08-30, esta sesión, tras trabajo adicional del holding/gestor de empresas y leads manuales)**: `docs/23` ítem 30 ("Alta de empresa nueva") pasó de ⏳ a ✅ — el botón "Nueva empresa" + `CrearEmpresaHoldingDialog.tsx` ya existen (commit `8cdfbb0`), corrigiendo la nota anterior que decía que no había ningún consumidor de `POST /empresas`. Ítem 28 ("Detalle de empresa") se corrigió: la nota que decía que el botón "Ver detalles" del gestor saltaba directo a `/usuarios?empresaId=` sin pasar por esta pantalla ya no es cierta (mismo commit `8cdfbb0`) — ahora sí navega a `/empresas/:empresaId`. Ítem 29 se reescribió para reflejar que Usuarios/Bridges de una empresa puntual ya no viajan por el query param `?empresaId=` compartido con las pantallas holding-wide propias, sino por rutas dedicadas nuevas (`EmpresaUsuariosPage.tsx`/`EmpresaBridgesPage.tsx`, sin commitear al momento de este barrido). Se agregaron ítems 33/34 ("Ingreso manual de leads" y "Carga masiva de leads por Excel", ambos 🎨 100% mock, sin backend) que no estaban documentados en absoluto. Se agregó nota de gate de navegación (commit `0ea8e06`, ya en `origin/test/gpt`) a los ítems 6 y 17: "Oportunidades"/"Bridges" se ocultan para holding-wide sin vista de empresa activa; Leads queda deliberadamente afuera. **Gap confirmado, no corregido en código (por instrucción explícita)**: el backend ya soporta `empresaId` opcional en `GET /leads` (`leads.access.ts::aplicarFiltroEmpresa`, mergeado desde `main`), pero ningún consumidor de frontend lo envía — en particular, "Detalle de empresa" (ítem 28) no muestra leads en absoluto. Ver fila nueva en "Brechas abiertas confirmadas" abajo. |
| `docs/blocks/{a,b,c}-*.md` | Vigente | Bloques cerrados de la migración multi-tenant | A, B y C están implementados. Bloque C cerró en `052e811`, 894/894 tests. |
| `docs/blocks/d0-visualizacion-multitenant.md` | Vigente | Contrato del único slice multi-tenant pre-despliegue | Expone al frontend la separación por empresa que el backend ya resuelve, sin routing, autoridad, dashboards ni cambios Prisma. |
| `docs/blocks/d-routing-oportunidad.md` | Vigente con reservas | Cierre esencial de routing, autoridad y Oportunidad | Corte ejecutado sobre `dev-mateo`: `Oportunidad`/`Producto`/pool por `Membresia`/autoridad de cierre D7/excepción D9 construidos y probados, cutover real de `leads.access.ts`/`asignacion.service.ts` aplicado. `CanalManual` sigue diferido. |
| `docs/blocks/e-dashboards.md` | Vigente con reservas | Dashboards, reportes y Meta Ads | Backend cerrado (extensiones de dashboard, exportación PDF/XLSX, OAuth+sync de Meta Ads) sobre `dev-mateo`; frontend de extensiones de dashboard, filtro por empresa y reportes PDF/XLSX ya construido y ruteado (`docs/23` ítems 13-15 ✅) — solo la UI de conexión de Meta Ads (ítem 16) sigue pendiente. |
| `docs/blocks/f-retiro-legacy.md` | Vigente con reservas | Retiro final de compatibilidad legacy | Precondición de autoridad holding-wide resuelta de forma aditiva (`SUPERVISOR_HOLDING`/`SUPER_ADMIN`); el retiro real de `Usuario.rol` sigue sin arrancar, bloqueado por la precondición de secuencia con `dev-back`/`dev-front`. |

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
| Filtro de leads por empresa no consumido en frontend | `GET /leads` ya acepta un `empresaId` opcional del lado del servidor (`backend/src/services/leads.access.ts::aplicarFiltroEmpresa`, mergeado a este worktree desde `main`), pero `frontend/src/funcionalidades/leads/leads.api.ts::LeadsQueryParams` no tiene ese campo y ningún consumidor lo envía. "Detalle de empresa" (`docs/23` ítem 28) no tiene ninguna sección de leads. | Un holding-wide no puede ver los leads de una empresa puntual desde ninguna pantalla, pese a que el backend ya lo permite. |

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
      `13-configuracion-bridges.md` (`13` ya separa Meta Lead Ads de Meta Ads
      Marketing API; falta reconciliar `08`).

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
