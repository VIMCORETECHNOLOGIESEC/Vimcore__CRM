# 16 — Hallazgos y decisiones para revisión cruzada

> **Estado:** síntesis histórica de hallazgos y decisiones D1-D15, reconciliada
> con el avance A-C. No es contrato funcional ni autoriza implementación.
>
> **Rama / upstream:** `test/gpt` / `origin/test/gpt`
>
> **Snapshot histórico de origen:** `e70b3a45402d8f258016a218ca87825ffd78af7f`
> (`e70b3a4`) · 2026-08-25
>
> **Baseline documental reconciliado:** `test/gpt` en `3e8c70a` · 2026-08-28.
>
> **Evidencia técnica vigente:** Bloques A-C cerrados en `052e811`, 894/894
> tests. Esta reconciliación documental no volvió a ejecutar tests.

**Ruta de estado actual:** consultar primero
[`00-estado-documentacion.md`](00-estado-documentacion.md) y después el bloque
correspondiente en [`docs/blocks/`](blocks/). Este documento conserva el
rationale y las decisiones de producto; no sustituye esos contratos de bloque.

Este documento concentra el rationale histórico y las decisiones para la
evolución multiempresa. Para conocer estado o ejecutar un bloque debe leerse
junto con `docs/00` y `docs/blocks/`.

## 1. Fuentes locales de evidencia

| Fuente presente en `origin/test/gpt` | Uso en esta revisión |
|---|---|
| [`AGENTS.md`](../AGENTS.md) y [`01-alcance-mvp.md`](01-alcance-mvp.md) | Baseline funcional, fundación multi-tenant AS-IS, alcance y exclusiones |
| [`02-reglas-negocio.md`](02-reglas-negocio.md) a [`05-bridges.md`](05-bridges.md) | Reglas, datos, cierre, semáforo e ingesta documentados |
| [`06-modulos-backend.md`](06-modulos-backend.md) a [`08-dashboard-kpis.md`](08-dashboard-kpis.md) | Checklists técnicos y definición de métricas |
| [`11-plan-integracion.md`](11-plan-integracion.md) a [`13-configuracion-bridges.md`](13-configuracion-bridges.md) | Integración histórica, QA y operación de bridges |
| [`schema.prisma`](../backend/prisma/schema.prisma) y [`migrations/`](../backend/prisma/migrations/) | Autoridad del esquema AS-IS |
| `backend/src/**` y `frontend/src/**` | Autoridad del comportamiento implementado |

## 2. Resumen ejecutivo

- La fundación multi-tenant ya está implementada sobre esquema compartido:
  `Empresa`/`Membresia`, login por membresía, `Bridge.empresaId` y
  `Lead.empresaId` obligatorios, RLS forzado, TenantContext y CAS optimista.
- `Membresia.empresaId` es `NOT NULL`: no existe una membresía holding-wide
  implementada. La sesión y autoridad holding AS-IS siguen usando
  `Usuario.rol` legacy hasta los cortes de D/F.
- Bloque A cerró la atribución canónica `Lead.campaniaId` y el productor
  `TOKEN_POR_EXPIRAR`; no son pendientes de Bloque E.
- El comportamiento aún pendiente incluye pool empresarial, autoridad de
  cierre por membresía, `Oportunidad`/`Producto`, `CanalManual` y dashboards.
- Calendario vigente: D0 es el único slice pre-despliegue; D y E son
  post-despliegue; F es el último bloque y respeta su dependencia de secuencia.

## 3. Alcance y método

La revisión original fue estática. Ante una contradicción prevalecen Prisma,
migraciones y código. La reconciliación de 2026-08-28 incorpora el cierre
verificado de A-C (`052e811`, 894/894 tests) sin ejecutar nuevamente
contenedores, tests o QA.

## 4. Hallazgos verificados

### 4.1 Documentación y confianza — snapshot histórico

| Hallazgo | Estado verificado | Tratamiento |
|---|---|---|
| `docs/03` describe relaciones y columnas inexistentes | No confiable; Prisma y migraciones prevalecen | Corregir antes de diseñar esquema |
| `docs/04` diverge del contrato real de cierre | La API fija `cerradoEn`; Venta no acepta observación | Reconciliar documentación y contrato aprobado |
| `docs/05` mezcla requisito, diseño e implementación | No permite inferir por sí solo el estado de M4 | Separar AS-IS de intención |
| `docs/06` y `docs/07` conservan diarios históricos | Sus resúmenes iniciales son útiles, el cuerpo exige contexto | Reducir y mover cronología a Git |
| `docs/08` atribuye métricas principalmente a eventos | Campaña se consulta desde JSON y monto desde columnas | Documentar la fuente real de cada KPI |
| `docs/12` no coincide con los seeds actuales | No permite aprobar QA reproducible | Reconstruir fixtures y resultados esperados |
| README de backend y frontend proponen ejecución en host | Contradicen la política container-only | Alinear con la ruta Docker del README raíz |
| `AGENTS.md` y `docs/01` llaman preparado al sitio web | `RedSocial` no incluye `SITIO_WEB`; el genérico fija Google Forms | Tratarlo como expansión, no como capacidad lista |

En el snapshot original había correcciones fuera de su commit aislado. La
tabla anterior se conserva como registro histórico; `docs/00` mantiene el
estado documental vigente.

**Seguimiento de resolución (auditoría de documentación, 2026-08-27 — no
altera los hallazgos originales de arriba, que quedan como registro
histórico de la revisión estática):**

- ✅ Resuelto: `docs/03-modelo-datos.md` fue regenerado desde Prisma y
  migraciones; ya no tiene banner de no confiable y está marcado Vigente
  con reservas en `docs/00`.
- ✅ Resuelto: `docs/06-modulos-backend.md` y `docs/07-modulos-frontend.md`
  ya redujeron el diario histórico y quedaron como checklists lean del
  estado consolidado (Lote 3 de `docs/00`).
- ⏳ Sigue abierto: `docs/04`, `docs/05`, `docs/08`, `docs/12`, los README
  de backend/frontend y la mención de sitio web preparado en `AGENTS.md`/
  `docs/01` — ver `docs/00-estado-documentacion.md` para el estado
  vigente de cada uno.

### 4.2 Roles y autorización actual

| Área | AS-IS verificado | Brecha |
|---|---|---|
| Roles | `Membresia` empresarial existe con `empresaId NOT NULL`; `Usuario.rol` legacy sigue activo | La autoridad holding y el cierre aún no completaron el cutover a membresías |
| Visibilidad | Sesiones company quedan scopeadas por membresía, TenantContext y RLS | Las sesiones holding todavía se resuelven por `Usuario.rol` legacy |
| Edición | Admin, supervisor o responsable operativo actual | El asesor puede ejecutar cierres mientras siga siendo responsable |
| Traspaso | Bloqueado en `NUEVO`; permitido desde etapas posteriores | La etapa no prueba primer contacto |
| Divergencia | `docs/02` habilita intervención administrativa en cualquier momento | `canTransfer` bloquea `NUEVO` para todos los roles |
| Excepciones | Admin y supervisor pueden traspasar sin asesor previo | El vendedor puede recibir trabajo sin intervención verificable del asesor |
| Segundo traspaso | Bloque A impide que el asesor original vuelva a transferir tras el primer traspaso | Cerrado para el AS-IS |
| Elegibilidad | No existe permiso dinámico por Fuente | El pool global no limita redes, páginas, sitios o formularios |

El TO-BE aprobado combina capacidad, membresía, scope, propiedad, elegibilidad
y flujo. Su fundación existe, pero el reemplazo funcional de `Usuario.rol`
permanece distribuido entre D y F.

### 4.3 M4 — Ingesta, bridges y atribución

| Prioridad | Hallazgo verificado | Consecuencia |
|---|---|---|
| Cerrado A | El adaptador genérico recibe la red real del bridge | Ya no fija `GOOGLE_FORMS` para todos los ingresos |
| Cerrado A | `Lead` materializa atribución canónica de cuenta y campaña | `Lead.campaniaId`/`cuentaPublicitariaId` ya existen |
| Cerrado A | La ingesta resuelve `Lead.campaniaId` desde la campaña externa | E debe consumir esa FK, no volver a agregarla |
| Cerrado A | `TOKEN_POR_EXPIRAR` tiene productor idempotente | La sincronización Meta futura lo complementa, no lo inaugura |
| Cerrado A/C | El ingreso incompleto notifica a supervisores y C scopea destinatarios | Ya no es una brecha pendiente |
| P2 | LinkedIn y X siguen pendientes | Ampliarlos ahora repetiría el defecto de atribución |

SITIO_WEB es una expansión futura. Cuenta/campaña ya están estabilizadas por
A; Fuente y routing permanecen en la evolución posterior.

### 4.4 M5/M6 — Gestión, asignación y handoff

| Prioridad | Hallazgo verificado | Consecuencia |
|---|---|---|
| Cerrado AS-IS / pendiente D7 | Bloque A introdujo `canClose`; la autoridad sigue leyendo `Usuario.rol` | D hará el cutover a membresía y `habilitadoParaVenta` |
| P0 | El traspaso no consulta un evento o dato explícito de primer contacto | Cambiar de etapa no acredita gestión previa |
| P0 | Admin y supervisor pueden entregar a vendedor un lead sin asesor | Se omite la intervención inicial solicitada |
| Cerrado A | El segundo traspaso del asesor original se rechaza | El contrato AS-IS quedó estabilizado |
| Cerrado A | `hasta` cubre el fin del día y valida el orden del rango | Ya no es brecha |
| Cerrado A | `vista=activos|cerrados` existe | Ya no es brecha |
| Cerrado A | `limite` aplica 10/25/50/100 | Contrato alineado |

La asignación vigente usa pool global por rol, menor carga y desempate FIFO,
sin scope empresarial todavía. D4 (§8) ya resolvió que el TO-BE filtra por
membresía de empresa completa, sin sub-filtro por Fuente — Fuente queda como
dato de atribución/reporte, nunca como filtro automático de routing.

### 4.5 Evolución tenant y holding

- D1 resolvió **Holding como tenant** con empresas internas; A-C ya
  materializaron Empresa/Membresia, claves obligatorias y aislamiento.
- Empresa es el scope funcional inequívoco del lead.
- Fuente es la unidad candidata de routing; Bridge es la conexión configurada y
  Activo de captación es solo el concepto paraguas.
- Membresías, SSE, jobs, logs y datos críticos ya tienen aislamiento
  empresarial en C; routing, autoridad y dashboards completan el
  comportamiento en D/E/F.
- D13/D14 resolvieron la separación `Lead`→`Oportunidad` y `Producto`; su
  implementación sigue pendiente en D post-despliegue.
- El reporting consolidado requiere distinguir empresa, Fuente, asesor y
  vendedor sin borrar la contribución previa al handoff.

## 5. Estado actual de ejecución

| Tramo | Estado vigente |
|---|---|
| A-C | Cerrados en `052e811`, 894/894 tests: fundación, login por membresía, ownership obligatorio, RLS, TenantContext y CAS. |
| D0 | Único slice multi-tenant pre-despliegue; hace visible el scope empresarial existente. |
| D | Post-despliegue: pool empresarial, autoridad por membresía, `Oportunidad`/`Producto`; `CanalManual` y D9 siguen diferidos dentro de su alcance. |
| E | Post-despliegue y dependiente de D para cerrar dashboards de Oportunidad/producto. |
| F | Último bloque: retiro de `Usuario.rol`/`RolUsuario`, sujeto además a su dependencia dura de secuencia. |
| D15 | Decisión preservada como trabajo futuro sin bloque asignado; no bloquea D0 ni D/E/F. |

LinkedIn, X, sitio web, personalización total, marketing, servicio, revenue
ampliado, IA y app nativa conservan su clasificación diferida original. Para
el backlog documental vigente, usar `docs/00-estado-documentacion.md`.

## 6. Referencias oficiales para el contraste CRM

Estas fuentes sustentan patrones de mercado, no requisitos del producto:
- [HubSpot — Understand objects](https://knowledge.hubspot.com/records/understand-objects): distingue Contact, Company, Lead y Deal sobre una plataforma común.
- [HubSpot — Assign and rotate record owners](https://knowledge.hubspot.com/workflows/assign-and-rotate-record-owners-using-workflows): documenta ownership y distribución mediante workflows.
- [HubSpot — Connect additional brand domains](https://knowledge.hubspot.com/domains-and-urls/connect-additional-brand-domains): muestra Brands como agrupación de activos dentro de una cuenta, no como prueba de aislamiento tenant.

Consultadas el 2026-08-25: orientan separación semántica, no copia de objetos.

## 7. Plan por fases

| Fase | Resultado esperado | Puerta de salida |
|---|---|---|
| 0 — Autoridad documental | AS-IS verificable y QA reproducible | Fuentes mixtas corregidas o claramente bloqueadas |
| 1 — Contrato de producto | Decisiones comerciales y D1 registradas | Matriz de capacidades, scope y handoff aprobada |
| 2 — Endurecimiento single-company | ✅ Bloque A cerrado | Atribución, alertas y exactitud verificadas |
| 3 — Fundación tenant aditiva | ✅ Bloque B cerrado | Empresa/Membresia, login por membresía y backfill implementados |
| 4 — Aislamiento efectivo | ✅ Bloque C cerrado | Ownership obligatorio, RLS/TenantContext/CAS y pruebas adversariales |
| D0 — Visualización mínima | Pre-despliegue | Scope empresarial visible sin routing ni cambios Prisma |
| 5 — Routing y handoff | Post-despliegue, pendiente | Pool empresarial, autoridad y `Oportunidad`/`Producto` |
| 6 — Reporting jerárquico | Post-despliegue, pendiente de D | KPIs separados por empresa, asesor y vendedor |
| 7 — Retiro legacy | Último bloque, pendiente | Retiro de `Usuario.rol` y compatibilidad restante |

Todo cambio funcional o de esquema mantiene, cuando aplique, código, migración,
documentación y pruebas en el mismo work unit. El orden no autoriza trabajo.

## 8. Decisiones en orden

### D1 — Frontera tenant

> **¿El holding será el tenant principal con varias empresas internas, o cada
> empresa será un tenant independiente coordinado mediante federación?**

D1 bloquea el esquema definitivo, la clave de aislamiento, la administración y
la estrategia de migración.

**Resolución (2026-08-25):** Holding como tenant principal, con empresas
internas como scope funcional del lead.

- El tenant es el holding (caso piloto: un holding personalizado tipo Arcano),
  no cada empresa por separado ni una federación de tenants independientes.
- Dentro del holding existen varias empresas internas, cada una enfocada en un
  área comercial distinta.
- Cada empresa mantiene sus propias redes sociales y, por lo tanto, sus
  propios Bridges de captación.
- El acceso de asesores a leads queda determinado por la empresa dueña del
  Bridge de origen: un asesor ve los leads de las empresas a las que
  pertenece, no el pool completo del holding.
- Objetivo de producto: resolver primero este cliente (holding con empresas
  internas) sobre una base que luego generalice a un SaaS multi-holding o a
  empresas únicas sin holding. La generalización no debe anteponerse a la
  satisfacción de este cliente piloto.

**Estado implementado A-C:** `Empresa`/`Membresia` ya existen; el holding no
tiene tabla propia y opera como frontera lógica sobre un esquema compartido.
`Bridge.empresaId` y `Lead.empresaId` son obligatorios, y Bloque C aplica RLS
y TenantContext. D1 conserva su valor de producto, pero ya no describe una
fundación pendiente.
→ ver `docs/blocks/b-tenant-prisma-foundation.md`.

**D2 — Frontera de identidad y deduplicación — Resuelto (2026-08-25):**

- **Cliente:** identidad compartida a nivel holding. El mismo
  `telefonoNormalizado` identifica a la misma persona en todas las empresas;
  se mantiene el `@unique` global de `backend/prisma/schema.prisma:136`, sin
  cambio de esquema en Cliente.
- **Lead:** scope por empresa, no por holding. Un mismo Cliente puede tener
  varios leads simultáneos, cada uno abierto e independiente en distintas
  empresas — cada empresa lleva su propio proceso de venta. El chequeo de
  "lead abierto" para bloquear duplicados deja de evaluarse por cliente y pasa
  a evaluarse por (cliente, empresa).
- **Ingesta:** el registro de entrada debe declarar explícitamente la empresa
  o empresas de destino. Un lead no puede crearse sin empresa de enrutamiento;
  si el ingreso declara varias empresas a la vez, se crean leads
  independientes por cada una, no un lead compartido.
- **Reingreso (ventana de 90 días):** se evalúa por (cliente, empresa), no a
  nivel holding, y deja de ser la constante fija `VENTANA_REINGRESO_DIAS` de
  `config/negocio.ts` — pasa a ser configurable por administrador.

**Estado de implementación:** `Lead.empresaId` ya existe y es `NOT NULL`
desde A-C. La mecánica funcional de apertura/deduplicación y la configuración
de reingreso se completa con D13/D14 en Bloque D; esta nota no autoriza ese
trabajo. → ver `docs/blocks/b-tenant-prisma-foundation.md` y
`docs/blocks/d-routing-oportunidad.md`.

**Nota para D3/D4/D5/D6/D9 (propuesta de flujo, no aprobada):** surgió el caso
de un cliente promocionado o recomendado de una empresa a otra dentro del
mismo holding, sin que eso cree automáticamente un lead en la empresa destino.
Propuesta de flujo evaluada:

1. El cliente NO se vuelve a dar de alta: se reutiliza `Cliente` (ya
   holding-shared por D2, `telefonoNormalizado` único). No se requiere tabla
   de clientes nueva; alcanza con poder filtrar `Cliente.leads` por
   `empresaId` una vez que Lead lo tenga (implicación de esquema ya anotada
   arriba).
2. La recomendación se registra en una entidad nueva y separada del Lead
   (ej. `RecomendacionCruzada`: cliente, empresa origen/destino, lead origen,
   asesor que recomienda, motivo, estado PENDIENTE/ACEPTADA/RECHAZADA). No
   crea Lead en la empresa destino todavía.
3. Se notifica al **supervisor de la empresa destino** vía `Notificacion`
   (tipo nuevo). **Historia del bloqueo:** en el snapshot original solo
   existía `Usuario.rol`; A-C ya incorporaron membresías empresariales y
   scoping de notificaciones. La entidad `RecomendacionCruzada` continúa sin
   implementarse.
4. El supervisor acepta o rechaza. Solo al aceptar se crea el `Lead` real en
   la empresa destino (`empresaId`, mismo `clienteId`, mismo cliente). Al
   rechazar, la recomendación queda auditada sin generar lead — cumple el
   pedido de dejar registro de movimientos sin forzar el ingreso.
5. **Cambio de Bridge confirmado e implementado:** `Bridge.empresaId` ya es
   `NOT NULL` (1 Bridge = 1 Empresa). El diseño de recomendación sigue
   necesitando un origen interno porque el flujo normal nace de `LeadRecibido`
   con `bridgeId` obligatorio; un lead recomendado nace de un evento interno,
   sin Bridge. `Lead.origen` (enum `OrigenLead`) necesita un valor nuevo para
   este camino de entrada que no pasa por ningún Bridge.
6. Tras crearse el Lead en destino, entra al algoritmo de asignación normal
   de esa empresa (D3) — el supervisor no asigna asesor a mano.
7. El acceso del asesor sigue siendo por empresa, no por Bridge ajeno: al
   aceptarse, el lead recomendado ya es un lead propio de su empresa. La
   recomendación no amplía qué Bridges gestiona un asesor — evita romper el
   aislamiento fijado en D1.

**Nota de estado (2026-08-25):** D3, D5, D6 y D9 quedaron resueltos más
adelante en esta misma sección; D4 se resuelve justo debajo de esta nota. El
bloqueante duro del paso 3 (no había forma de resolver "quién es supervisor
de la Empresa B") ya no aplica — lo resuelve la membresía usuario↔empresa↔rol
de §8.2. Lo único que sigue sin aprobar formalmente es la entidad
`RecomendacionCruzada` en sí (pasos 1-6): sigue siendo diseño evaluado, no
esquema autorizado.

**D4 — Granularidad de elegibilidad — Resuelto (2026-08-25):** elegibilidad
por membresía de empresa, sin sub-filtro dentro de ella.

- Un usuario ve los leads de las empresas donde tiene una `Membresia`
  activa (D5/§8.2) — no ve nada de una empresa sin membresía.
- Dentro de una empresa a la que pertenece, ve **todas** las redes
  sociales/Bridges configurados para esa empresa — no hay una elegibilidad
  más fina por red social individual dentro de la misma empresa.
- **No hay herencia automática de elegibilidad entre empresas del holding.**
  La única vía de cruce es la recomendación aceptada (nota anterior): una vez
  que el supervisor de la empresa destino acepta, el lead resultante entra al
  alcance normal de la membresía de esa empresa — no se necesita ninguna
  regla de herencia adicional, la membresía ya lo cubre. → ver
  `docs/blocks/d-routing-oportunidad.md`.

**D3 — Cardinalidad de routing por sitio — Resuelto (2026-08-25):** pool por
empresa, no pool global. Candidatos = asesores activos que pertenecen (vía
membresía) a la empresa dueña del bridge de origen del lead. Se conserva el
algoritmo vigente de `docs/02` §3 (menor carga activa, desempate FIFO por
`ultima_asignacion_en` más antigua) — solo cambia el universo de candidatos,
que deja de ser global. → ver `docs/blocks/d-routing-oportunidad.md`.

**D5 — Roles múltiples — Resuelto (2026-08-25):** se reemplaza el enum plano
`RolUsuario` (`ADMINISTRADOR/SUPERVISOR/ASESOR/VENDEDOR`) por una jerarquía de
membresía:

- **Super admin (holding):** scope holding-wide. Crea empresas, configura
  qué bridges pertenecen a cada una, ve el dashboard consolidado del holding
  y puede además ingresar al CRM de cada empresa individual para ver sus
  datos y dashboards puntuales.
- **Administrador de holding:** puede crear usuarios dentro de cualquier
  empresa del holding y configurar bridges de cualquier empresa —misma
  jerarquía de acceso que el super admin para este propósito.
- **Administrador de empresa:** ve, crea y actualiza los bridges de su
  propia empresa únicamente; crea usuarios dentro de su propia empresa. Sin
  acceso a otras empresas del holding.
- **Supervisor:** rol de control. Solo lectura de estados de leads y sin
  capacidad de asignar citas, **pero sí conserva la reasignación manual de
  responsable**, en pie de igualdad con Administrador (corregido el
  2026-08-25 — la versión anterior de esta nota decía que se eliminaba por
  completo para Supervisor; queda revertido).
- **Asesor:** rol operativo único — se elimina el rol Vendedor separado.
  Cada asesor tiene un atributo "habilitado para venta" (booleano, por
  membresía de empresa).

→ ver `docs/blocks/b-tenant-prisma-foundation.md`.

**D9 — Política de excepciones — Resuelto (2026-08-25, corregido en la misma
fecha):** Administrador (de holding o de empresa) **y Supervisor** conservan
la reasignación manual de responsable como excepción auditada. Uso previsto:
casos puntuales de error de asignación o cambio urgente de atención del
asesor, no la operatoria regular (que queda 100% automática por D8).
Ubicación de UI: **ambas** entradas se mantienen — reasignación individual
desde la vista de detalle del lead, y reasignación desde la tabla/listado de
leads, esta última porque el listado permite reasignación masiva (varios
leads a la vez), algo que el detalle no cubre. Cada reasignación manual debe
auditarse (quién, cuándo, motivo, individual o masiva), como excepción sobre
el flujo automático de D8, no como reemplazo de él. → ver
`docs/blocks/d-routing-oportunidad.md`.

**Estado de implementación:** `Membresia` y `habilitadoParaVenta` ya existen,
pero toda membresía es empresarial (`empresaId NOT NULL`). No se implementó
un nivel de membresía holding-wide: la autoridad holding AS-IS permanece en
`Usuario.rol` legacy hasta D/F. La reinterpretación funcional de responsables
y cierre corresponde a D13/D14.
→ ver `docs/blocks/d-routing-oportunidad.md`.

**D7 — Competencia sobre `NO_VENTA` — Resuelto (2026-08-25):** solo el asesor
habilitado para venta que tiene el lead asignado en ese momento puede marcar
`VENTA` o `NO_VENTA`. Un asesor no habilitado solo puede avanzar el lead hasta
calificarlo y registrar el primer contacto; no tiene autoridad de cierre. Esto
cierra por construcción el hallazgo P0 de `docs/16` §4.4 ("el responsable
operativo puede cerrar desde etapas no terminales"), una vez implementado.
→ ver `docs/blocks/d-routing-oportunidad.md`.

**D8 — Modalidad del handoff — Resuelto (2026-08-25):** asignación automática
inmediata, sin aceptación manual ni devolución. Al calificar y registrar el
primer contacto, si el asesor actual no está habilitado para venta, el lead
reingresa al pool automático (mismo algoritmo de D3, pool restringido a
asesores habilitados para venta) y se asigna automáticamente al ganador. No
hay paso de aceptación por parte del asesor receptor. → ver
`docs/blocks/d-routing-oportunidad.md`.

**D6 — Scope de supervisión — Resuelto (2026-08-25):** espejo exacto de la
jerarquía admin de D5, sin niveles intermedios (no hay "conjunto arbitrario de
empresas asignadas a mano").

- **Supervisor de holding:** se pueden crear N supervisores a nivel holding.
  Ven métricas y dashboards de todo el holding, sin ningún permiso de
  modificación que sí tiene Administrador. Pueden ingresar a cada empresa
  individualmente para revisar internamente, igual que el super admin
  "curiosea" los CRMs de empresa (misma capacidad de D5, aplicada a
  supervisión en vez de administración).
- **Supervisor de empresa:** cada empresa puede generar sus propios usuarios
  supervisores, con acceso únicamente a los listados de leads de esa empresa.

→ ver `docs/blocks/c-aislamiento.md`.

**8.1 — Riesgos de diseño detectados en D3/D5/D8/D9 (estado distribuido por
bloque).** Detalle completo, evidencia y resolución en `docs/blocks/`:

1. Invariante de `Lead.asesorId` ante D9: decisión registrada en Bloque D;
   implementación pendiente junto con D9.
2. Corrección de tecnología: el sistema usa SSE, no websockets
   (`backend/src/lib/event-broker.ts:79`).
3. El SSE es UX, nunca el mecanismo de autorización — resuelto en Bloque C.
4. Condición de carrera de asignación — CAS implementado en Bloque C; la
   semántica D8/D9 se completa en D.
5. Destinatarios de notificación por empresa — resuelto en Bloque C mediante
   membresías empresariales, sin `empresaId = null`.

**8.2 — Fundación implementada: membresía usuario↔empresa↔rol.**

Bloques B/C implementaron `Empresa`, `RolMembresia` y `Membresia` sin tabla
`Holding`. El desvío respecto del diseño inicial es deliberado y vigente:

- `Membresia.empresaId` es `NOT NULL`; toda membresía pertenece a una Empresa.
- No existe una membresía holding-wide implementada. La idea histórica de
  `empresaId = null` fue descartada por la implementación y no debe usarse
  para consultas ni autorización.
- La sesión y autoridad holding AS-IS se resuelven mediante `Usuario.rol`
  legacy. Cuando una consulta holding necesita membresías, agrega las filas
  empresariales concretas del usuario.
- Un usuario sí puede tener varias membresías activas en distintas empresas
  del holding y con roles distintos, según las restricciones del modelo.

**Ciclo de vida implementado:** quitar a alguien de una empresa usa
`Membresia.activa = false`, nunca `DELETE`. `Usuario.activo` se recalcula al
perder o recuperar su última membresía empresarial; la excepción holding se
evalúa mediante la autoridad legacy de `Usuario.rol`, no mediante una
membresía con `empresaId = null`.

El esquema y sus desvíos están documentados en
`docs/blocks/b-tenant-prisma-foundation.md`; el aislamiento efectivo y las
consultas holding/empresa, en `docs/blocks/c-aislamiento.md`.

**8.3 — Ruteo de login sin selector: correo por membresía (implementado en
Bloque B).**

El login por `Membresia.correo`/`passwordHash`, la resolución de sesión
company y `RefreshToken.membresiaId` ya están implementados. Las credenciales
son independientes por empresa y la identidad de negocio sigue siendo
`Usuario.id`. Esto no completó el cutover de autoridad: las sesiones holding
y las decisiones funcionales todavía dependientes del rol plano continúan
usando `Usuario.rol` legacy hasta D/F. Contrato técnico en
`docs/blocks/b-tenant-prisma-foundation.md`.

**D10 — Rendimiento de canal — Resuelto (2026-08-25):** métricas
publicitarias reales (Meta Ads primero), cruzadas con la conversión real del
CRM — no solo conteos propios de `Lead`. → ver `docs/blocks/e-dashboards.md`.

**8.4 — Estado de campañas e ingreso manual.**

**Cerrado en Bloque A:** `Lead.campaniaId`/`cuentaPublicitariaId` ya existen y
se resuelven durante la ingesta; `TOKEN_POR_EXPIRAR` ya tiene productor
idempotente. No pertenecen al backlog pendiente de E.

**Pendiente post-despliegue:**

- Bloque E conserva la sincronización del catálogo y métricas reales de Meta
  (`CampaniaMetricaDiaria`, CPC/CPL/CAC) y debe consumir `Lead.campaniaId` ya
  existente.
- Bloque D conserva el ingreso manual (`OrigenLead.MANUAL`, `CanalManual`) como
  alcance diferido no bloqueante del núcleo de routing/Oportunidad.

**Confirmado (2026-08-25), se conserva acá por ser decisión de producto, no
diseño de esquema:** en el selector de Bridges, `X` y `LINKEDIN` (3 de 5
valores de `enum RedSocial` desarrollados hoy: Facebook/Instagram/Google
Forms) se restringen por allowlist de aplicación y van comentados en el
código del selector de frontend, no eliminados — sin tocar el schema.

**8.5 — Plan de implementación: exportación de reportes (PDF/XLSX;
decisión resuelta, implementación pendiente en E).**

Reutiliza las mismas consultas de agregación ya expuestas por
`backend/src/controllers/metricas.controller.ts` — exportar es una capa de
renderizado, no reinventar la agregación. **Acceso confirmado (2026-08-25):**
solo Supervisor y Administrador (empresa u holding) pueden generar/ver/
extraer el reporte — Asesor no. Diseño completo (generación PDF vía
Chromium server-side, XLSX vía `exceljs` sin gráficos nativos, modelos
`ConfiguracionReporte` y `ReporteJob`, generación asincrónica con progreso
por SSE) movido a `docs/blocks/e-dashboards.md`.

**D11 — Topología física — Resuelto (2026-08-25):** **esquema compartido,
una sola base de datos** para todo el holding — no una base de datos por
empresa.

- **Por qué:** una base por empresa multiplica el costo de despliegue
  (backup, monitoreo, migraciones, conexiones) por cada empresa nueva del
  pool incremental, y encima obliga a un broker/router para resolver a qué
  base conectarse y para agregar reportes holding-wide (D6/D10) entre bases
  separadas — complejidad que el esquema compartido con `empresaId` no
  necesita, porque agregar entre empresas es un `GROUP BY` normal.
- **Riesgo a mitigar (no descarta la decisión):** con esquema compartido, un
  bug que olvide filtrar por `empresaId` puede filtrar datos entre
  empresas. **Mitigación ya implementada en Bloque C:** scoping obligatorio,
  TenantContext por `AsyncLocalStorage`, RLS forzado de Postgres, partición de
  jobs y pruebas adversariales. RLS es defensa adicional, no sustituto de la
  autorización de aplicación.
- **Casos donde SÍ se justificaría una base separada por empresa** (ninguno
  aplica hoy a Arcano, quedan como criterio para el futuro SaaS):
  1. Requisito regulatorio de residencia de datos (la ley exige que los
     datos de una empresa vivan en una región/jurisdicción específica).
  2. Exigencia contractual de un cliente empresarial grande que pide
     aislamiento físico como condición del contrato.
  3. Una empresa con volumen desproporcionado frente al resto, al punto de
     necesitar escalar su base de forma independiente.
  4. Sharding por escala extrema del SaaS (miles de tenants) — ahí ya no es
     una decisión de seguridad sino de escalamiento horizontal, y se
     resuelve con una capa de sharding, no con una base por cliente chico.

→ ver `docs/blocks/b-tenant-prisma-foundation.md`.

**D12 — Integraciones compartidas — Resuelto (2026-08-25):** sin ownership
compartido entre empresas — cada empresa registra y mantiene sus propias
credenciales, siempre, aunque la cuenta publicitaria real de Meta detrás sea
la misma para varias empresas del holding. Costo operativo aceptado: si el
token de Meta se renueva, hay que actualizarlo en cada fila por separado —
mismo criterio que las credenciales de login por empresa (§8.3). Nota de
esquema (`CuentaPublicitaria` ya soporta esto sin cambios) en
`docs/blocks/f-retiro-legacy.md`.

**D13 — Límite Lead→Oportunidad — Resuelto (2026-08-25):** un mismo cliente
puede tener **varias negociaciones de venta en paralelo dentro de la misma
empresa** (ej. seguro de auto y seguro de vida a la vez), cada una habilitada
según el proceso de compra que corresponda. `Lead` (el contacto) y
`Oportunidad` (cada negociación) dejan de ser la misma fila.

Esquema Prisma de `Oportunidad` (campos que se mueven desde `Lead`: `etapa`,
`semaforo`, `puntuacion`, `asesorId`/`vendedorId` de venta, `montoVenta`,
`observacionCierre`, `formaPago`, `cerradoEn`) y el criterio de qué queda en
`Lead` como contacto: movidos a `docs/blocks/d-routing-oportunidad.md`.

**Estado de implementación:** decisión preservada; `Oportunidad`/`Producto`
siguen pendientes en Bloque D post-despliegue. D0 no los implementa.

**Historia de decisión — efecto cascada señalado y resuelto inmediatamente en
D14:** en este punto de la revisión el cambio reabría mecánica (no la decisión
de fondo) de D2, D3,
D7, D8 y D9, porque "lead abierto", el pool de asignación, la autoridad de
cierre y la reasignación manual pasarían a operar sobre `Oportunidad`, no
sobre `Lead`. Por disciplina del documento (§9: los temas se registran
explícitamente) esto queda anotado como pendiente de una pasada de
verificación antes de migrar, no como una reinterpretación silenciosa de
D2/D3/D7/D8/D9.

**Nota de estado (2026-08-25):** el efecto cascada señalado arriba quedó
resuelto en **D14**, inmediatamente debajo.

**D14 — Efecto cascada de D13 sobre D2/D3/D7/D8/D9 (Oportunidad y
Producto) — Resuelto (2026-08-25):**

> **Estado de implementación:** pendiente en Bloque D post-despliegue. Las
> reglas siguientes están decididas, no desplegadas.

- **Catálogo `Producto` por empresa, no texto libre.** Se reemplaza
  `Oportunidad.productoServicio: String?` de la propuesta de esquema de D13
  por un catálogo real, mismo patrón que `CanalManual` — un selector es más
  simple de usar que texto libre para alguien sin experiencia en CRM, y
  habilita dedup exacto y reporting agregado sin normalizar strings. Esquema
  Prisma de `Producto` movido a `docs/blocks/d-routing-oportunidad.md`.

- **D2 — timing de apertura y regla de dedup, ajustada:** la Oportunidad se
  puede abrir en cualquier etapa del Lead, no solo al calificar — cualquier
  mención de interés del lead/cliente en cualquier momento del contacto
  habilita crear una Oportunidad nueva. Se bloquea la creación solo si ya
  existe una Oportunidad **abierta** (etapa fuera de `VENTA`/`NO_VENTA`)
  para el mismo `(leadId, productoId)`. Una vez cerrada — sea `VENTA` o
  `NO_VENTA` — se puede abrir una Oportunidad nueva del mismo producto sin
  ventana de espera: a diferencia del reingreso de Cliente/Lead de D2 (90
  días), acá no aplica ninguna ventana mínima porque es la misma
  negociación del mismo cliente ya en gestión, no un reingreso externo.

  Verificado contra investigación de mercado (2026-08-25): ni HubSpot
  (Deals), ni Pipedrive, ni Salesforce (Opportunities) ni Zoho bloquean
  duplicados de negociación por defecto — es configuración opcional o una
  limitación conocida de la plataforma. El bloqueo nativo obligatorio que
  fija esta decisión es más simple que el estándar de mercado, no más
  complejo: el usuario sin experiencia en CRM nunca llega a ver el
  problema.

- **D3 — pool de asignación, con bypass de autoasignación:** si el asesor
  que abre la Oportunidad ya tiene `habilitadoParaVenta = true` en esa
  empresa, se autoasigna como responsable al instante, sin pasar por el
  pool. El pool de D3 (candidatos = asesores activos con membresía en la
  empresa, habilitados para venta, menor carga/FIFO) solo se dispara cuando
  quien abre la Oportunidad no está habilitado — ese caso es el que ya
  cubre D8. La autoasignación es un bypass del pool cuando el abridor ya
  cumple el criterio de destino, no una excepción que lo contradiga.

- **SLA de Oportunidad — mismo mecanismo que el SLA de Lead, no uno
  nuevo.** Confirmado (2026-08-25): se reutiliza exactamente
  `calculateEstadoSla` ya implementado para `Lead`
  (`backend/src/services/sla.calculator.ts`), sin duplicar la función.
  Campos nuevos (`Oportunidad.slaInicioEn`, `Empresa.slaOportunidadHoras`)
  en `docs/blocks/d-routing-oportunidad.md`.

- **D7 — sin cambios.** La regla ya estaba anclada al "responsable vigente
  de ese registro", no a cómo llegó a serlo — que el responsable se haya
  fijado por autoasignación (D3) o por el pool no altera quién tiene
  autoridad de cierre una vez asignado.

- **D8 — confirmado:** botón "+ Nueva oportunidad" visible en cualquier
  etapa del Lead; bloqueo con acción "Ir a la oportunidad existente" si ya
  hay una abierta del mismo producto (nunca un bloqueo mudo); autoasignación
  o pool según D3. Ejemplo de flujo paso a paso movido a
  `docs/blocks/d-routing-oportunidad.md`.

- **D9 — conviven dos listados (Lead y Oportunidad), con pools de asignación
  masiva distintos:** desde Lead, el destino puede ser cualquier asesor con
  membresía en la empresa; desde Oportunidad, solo un asesor con
  `habilitadoParaVenta = true` (D7/D8 lo exigen). La excepción auditada de
  Admin/Supervisor no cambia de titularidad, solo suma este filtro. Detalle
  de estructura de UI en `docs/blocks/d-routing-oportunidad.md`.

**8.6 — Plan de implementación: dashboards de rendimiento (decisión resuelta;
implementación pendiente post-despliegue al momento de esta síntesis).**

Nuevas vistas propuestas sobre `metricas.service.ts` ya existente: embudo
por Oportunidad, rendimiento por producto, cascada Lead→Oportunidad→Venta,
conversión habilitados/no habilitados para venta, ranking de productos por
empresa. Nada de esto se construye antes de que `Oportunidad`/`Producto`
existan en Prisma (Bloque D). Detalle y orden de implementación en
`docs/blocks/e-dashboards.md`. **Nota de estado (no reabre la decisión, solo
apunta a su seguimiento vigente):** `Oportunidad`/`Producto` ya existen y
esta implementación ya arrancó — ver estado real y commits en
`docs/blocks/e-dashboards.md` y `docs/23-alcance-funcional-manual-tecnico.md`
ítem 13; este documento conserva el rationale de la decisión, no el estado de
avance.

Todas las decisiones D1–D14 quedaron registradas explícitamente en esta
sección. Ningún tema queda aprobado por aparecer en una cola — cada
resultado debe registrarse antes de cambiar esquema, autorización o
contratos. El efecto cascada de D13 sobre D2/D3/D7/D8/D9, señalado como
pendiente en su momento, quedó resuelto en D14.

**D15 — Importación de datos históricos por empresa — Pendiente, diferido
(2026-08-27): no bloquea Bloque C.**

Contexto verificado: la **fundación A-C** se desarrolló antes de la primera
puesta en producción y dejó `Bridge.empresaId`/`Lead.empresaId` obligatorios;
no quedaron filas legacy con ese ownership nulo. Esto no significa que todo
D1-D14 esté desarrollado: routing, autoridad, `Oportunidad`/`Producto`,
`CanalManual`, dashboards y retiro legacy permanecen pendientes en D/E/F.

Sí queda una necesidad de producto real, distinta de la anterior: cuando una
empresa se suma al sistema, puede traer datos históricos propios (leads de
un CRM anterior, planillas, etc.) que hay que cargar ya asignados a esa
empresa. Propuesta de diseño evaluada, no aprobada ni asignada a un bloque
todavía:

- Handler de importación que recibe un lote de leads y una empresa destino
  explícita (selector, no inferencia) — los datos importados quedan scoping
  por esa empresa desde el alta.
- Paso de análisis de duplicados sobre el lote importado antes de persistir
  (mismo criterio de deduplicación por `telefonoNormalizado` de D2, evaluado
  contra los `Cliente`/`Lead` ya existentes de esa empresa) con una forma de
  resolver el conflicto (fusionar, omitir, o marcar para revisión manual —
  sin decidir todavía cuál).
- No es parte del alcance de Bloque C (aislamiento) ni del resto de bloques
  ya definidos (D, E, F). Queda como candidato a bloque propio o extensión
  de Bloque D/F cuando se priorice — a decidir en su momento, no ahora.

## 9. Criterio de entrega a otro equipo

- El equipo receptor distingue hechos AS-IS de propuestas TO-BE.
- D1 tiene respuesta explícita y A-C ya materializaron la fundación y el
  aislamiento.
- Los temas D2–D14 se resuelven en orden y se registran de forma explícita.
- Toda afirmación técnica se contrasta con código y migraciones.
- Los tests runtime futuros se ejecutan únicamente en el entorno Docker aprobado.
- Este documento se actualiza si cambia el código base o se aprueba una decisión.
Esta revisión añadió documentación únicamente. No modificó código, esquema,
dependencias, configuración de runtime ni datos, y no ejecutó tests runtime.
