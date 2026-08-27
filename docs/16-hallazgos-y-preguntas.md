# 16 — Hallazgos y decisiones para revisión cruzada

> **Estado:** artefacto autónomo de revisión estática; no es contrato funcional ni autoriza implementación.
>
> **Rama / upstream:** `test/gpt` / `origin/test/gpt`
>
> **Commit base:** `e70b3a45402d8f258016a218ca87825ffd78af7f`
> (`e70b3a4`) · **Corte:** 2026-08-25
>
> **Base probatoria:** archivos de `origin/test/gpt` en el commit indicado y fuentes oficiales directas de la sección 6.
>
> **Evidencia:** sin cambios de código ni pruebas runtime; no acredita tests, build ni QA.

Este documento concentra los hallazgos para corregir el MVP o diseñar la evolución
multiempresa. No depende de otros borradores y puede publicarse como único artefacto.

## 1. Fuentes locales de evidencia

| Fuente presente en `origin/test/gpt` | Uso en esta revisión |
|---|---|
| [`AGENTS.md`](../AGENTS.md) y [`01-alcance-mvp.md`](01-alcance-mvp.md) | Baseline single-company, alcance y exclusiones |
| [`02-reglas-negocio.md`](02-reglas-negocio.md) a [`05-bridges.md`](05-bridges.md) | Reglas, datos, cierre, semáforo e ingesta documentados |
| [`06-modulos-backend.md`](06-modulos-backend.md) a [`08-dashboard-kpis.md`](08-dashboard-kpis.md) | Checklists técnicos y definición de métricas |
| [`11-plan-integracion.md`](11-plan-integracion.md) a [`13-configuracion-bridges.md`](13-configuracion-bridges.md) | Integración histórica, QA y operación de bridges |
| [`schema.prisma`](../backend/prisma/schema.prisma) y [`migrations/`](../backend/prisma/migrations/) | Autoridad del esquema AS-IS |
| `backend/src/**` y `frontend/src/**` | Autoridad del comportamiento implementado |

## 2. Resumen ejecutivo

- El producto implementado es un CRM **single-company**, desplegado con una base
  aislada por empresa. No modela tenant, holding ni scope empresarial.
- El MVP ya cubre captación, deduplicación, asignación, embudo, SLA, citas,
  notificaciones y métricas, pero M4–M6 conservan brechas de atribución,
  autorización y exactitud de datos.
- La separación asesor→vendedor no está garantizada por el backend: el asesor
  puede cerrar mientras sea responsable y el traspaso no exige evidencia
  explícita de primer contacto.
- La evolución hacia holdings requiere decidir primero la frontera tenant. Sin
  esa decisión no existe una clave de aislamiento ni una migración segura.
- La prioridad no es replicar HubSpot: primero se estabilizan embudo, ownership,
  atribución y aislamiento; marketing, servicio, revenue e IA pueden diferirse.

## 3. Alcance y método

La revisión fue estática. Ante una contradicción prevalecen Prisma, migraciones y
código. No se instalaron dependencias ni se ejecutaron contenedores, tests o QA.

## 4. Hallazgos verificados

### 4.1 Documentación y confianza

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

Hay correcciones propuestas en el worktree, pero **no forman parte de este commit
aislado**. Las divergencias siguen abiertas hasta publicarse por separado.

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
| Roles | `ADMINISTRADOR`, `SUPERVISOR`, `ASESOR` y `VENDEDOR`; un rol global por usuario | No representa membresías ni roles distintos por empresa |
| Visibilidad | Admin y supervisor ven todo; asesor y vendedor ven su cartera | El acceso total no tiene scope empresarial |
| Edición | Admin, supervisor o responsable operativo actual | El asesor puede ejecutar cierres mientras siga siendo responsable |
| Traspaso | Bloqueado en `NUEVO`; permitido desde etapas posteriores | La etapa no prueba primer contacto |
| Divergencia | `docs/02` habilita intervención administrativa en cualquier momento | `canTransfer` bloquea `NUEVO` para todos los roles |
| Excepciones | Admin y supervisor pueden traspasar sin asesor previo | El vendedor puede recibir trabajo sin intervención verificable del asesor |
| Segundo traspaso | El asesor original puede volver a cambiar al vendedor | Ownership, auditoría y SLA pueden quedar ambiguos |
| Elegibilidad | No existe permiso dinámico por Fuente | El pool global no limita redes, páginas, sitios o formularios |

El TO-BE candidato combina capacidad, membresía, scope, propiedad, elegibilidad
y flujo. No está aprobado ni equivale a reemplazar el enum de roles.

### 4.3 M4 — Ingesta, bridges y atribución

| Prioridad | Hallazgo verificado | Consecuencia |
|---|---|---|
| P1 | El endpoint genérico usa el adaptador de Google Forms y fija `GOOGLE_FORMS` | X o sitio web quedarían registrados con un canal incorrecto |
| P1 | `LeadRecibido.bridgeId -> leadId` conserva linaje histórico indirecto | No existe atribución singular y canónica de Fuente, cuenta o campaña en `Lead` |
| P1 | `Campania` existe, pero la ingesta no la materializa ni la enlaza al lead | Filtros y métricas dependen de JSON o catálogos sintéticos |
| P1 | `tokenExpiraEn` existe, pero `TOKEN_POR_EXPIRAR` no tiene productor idempotente | Falta la alerta preventiva prometida |
| P2 | Un ingreso sin teléfono ni correo genera advertencia, no notificación | El supervisor no recibe el workflow operacional esperado |
| P2 | LinkedIn y X siguen pendientes | Ampliarlos ahora repetiría el defecto de atribución |

SITIO_WEB es una expansión futura. Antes de sumar canales se debe estabilizar
Fuente, Bridge, cuenta, campaña y procedencia de cada captación.

### 4.4 M5/M6 — Gestión, asignación y handoff

| Prioridad | Hallazgo verificado | Consecuencia |
|---|---|---|
| P0 | El responsable operativo puede cerrar desde etapas no terminales | Un asesor puede registrar `VENTA` o `NO_VENTA` |
| P0 | El traspaso no consulta un evento o dato explícito de primer contacto | Cambiar de etapa no acredita gestión previa |
| P0 | Admin y supervisor pueden entregar a vendedor un lead sin asesor | Se omite la intervención inicial solicitada |
| P0 | El asesor original puede ejecutar un segundo traspaso | El contrato de ownership no es estable |
| P1 | `hasta=YYYY-MM-DD` termina a medianoche y no valida el orden del rango | Se excluye casi todo el último día y se aceptan rangos invertidos |
| P2 | Falta `vista=activos|cerrados` | El listado no soporta esas vistas en servidor |
| P3 | `limite` no aplica la whitelist 10/25/50/100 | Frontend y backend aceptan contratos distintos |

La asignación vigente usa pool global por rol, menor carga y desempate FIFO. La
elegibilidad por Fuente es una propuesta, no el algoritmo actual.

### 4.5 Evolución tenant y holding

- La frontera puede ser **Holding como tenant** con empresas internas, o
  **Empresa como tenant** con coordinación federada del holding.
- Empresa debe ser el scope funcional inequívoco del lead, pero la clave física
  depende de la frontera elegida.
- Fuente es la unidad candidata de routing; Bridge es la conexión configurada y
  Activo de captación es solo el concepto paraguas.
- Membresías, capacidades, deduplicación, secretos, SSE, jobs, logs, caché y
  métricas deben respetar la misma frontera.
- La separación Lead→Oportunidad es la dirección semántica candidata. Su
  representación física sigue pendiente y no justifica imitar otro CRM.
- El reporting consolidado requiere distinguir empresa, Fuente, asesor y
  vendedor sin borrar la contribución previa al handoff.

## 5. Clasificación de acciones

### Corregir ahora

1. Reconciliar `docs/03`, `docs/04`, `docs/05`, `docs/08` y `docs/12` con las
   fuentes técnicas o marcarlas sin ambigüedad hasta su reescritura.
2. Reducir la cronología de `docs/06` y `docs/07` y alinear los README de paquete
   con el entorno Docker obligatorio.
3. Corregir el rango de fechas, las vistas y la whitelist de paginación de M5.
4. Corregir el origen genérico y completar las alertas M4/M8 ya comprometidas.
5. Retirar el filtro sintético de campaña o presentarlo como no disponible hasta
   contar con atribución real.

### Decidir antes de implementar

1. Frontera tenant, topología física y alcance del administrador del holding.
2. Identidad, deduplicación y reingreso entre empresas.
3. Membresías, roles múltiples, scope de supervisión y excepciones auditadas.
4. Competencia sobre Venta y No Venta, primer contacto y modalidad del handoff.
5. Fuente efectiva de routing, herencia de permisos y bridges compartidos.
6. Significado de rendimiento de canal y representación Lead→Oportunidad.

### Diferir

1. LinkedIn y X dentro del backlog MVP hasta estabilizar el contrato de origen.
2. Sitio web como expansión TO-BE no aprobada, posterior al contrato de Fuente.
3. Pipelines, formularios y scoring totalmente configurables.
4. Marketing email, publicación social, CMS, Service Desk y Customer Success.
5. Productos, cotizaciones, pagos, suscripciones y marketplace público.
6. IA predictiva y aplicación móvil nativa sin evidencia operativa suficiente.

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
| 2 — Endurecimiento single-company | Defectos deterministas de M4/M5 corregidos | Atribución de origen y rangos confiables |
| 3 — Fundación tenant aditiva | Empresas, membresías y ownership nullable | Backfill y rollback demostrables |
| 4 — Aislamiento efectivo | Scoping en consultas, jobs, SSE, logs y secretos | Pruebas adversariales entre empresas y tenants |
| 5 — Routing y handoff | Fuente, elegibilidad, primer contacto y pools separados | Vendedor solo recibe trabajo habilitado |
| 6 — Reporting jerárquico | Consolidado de holding y drill-down autorizado | KPIs separados por empresa, asesor y vendedor |
| 7 — Retiro legacy | Restricciones obligatorias y compatibilidad retirada | Migración, backup y recuperación verificados |

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

Verificado contra `backend/prisma/schema.prisma`: no existe hoy modelo
`Empresa`, `Holding` ni `Tenant`; el esquema es single-company, consistente
con el hallazgo del §2. D1 resuelto no autoriza por sí solo el cambio de
esquema — activa D2, D3, D6, D11 y D13, que siguen pendientes y deben
registrarse en orden antes de tocar Prisma, autorización o contratos.
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

Implicación de esquema pendiente de diseño (no autorizada por esta nota):
`Lead` necesita clave de empresa y la unicidad de "lead abierto" pasa a ser
compuesta; la ventana de reingreso pasa de constante de código a dato de
configuración. → ver `docs/blocks/b-tenant-prisma-foundation.md`.

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
   (tipo nuevo). **Bloqueante verificado:** hoy `Usuario.rol` es un enum
   global (`backend/prisma/schema.prisma:45`), sin membresía por empresa —
   no existe forma de resolver "quién es supervisor de la Empresa B". Este
   paso depende primero de D5 (roles múltiples) y D6 (scope de supervisión),
   no solo de D4.
4. El supervisor acepta o rechaza. Solo al aceptar se crea el `Lead` real en
   la empresa destino (`empresaId`, mismo `clienteId`, mismo cliente). Al
   rechazar, la recomendación queda auditada sin generar lead — cumple el
   pedido de dejar registro de movimientos sin forzar el ingreso.
5. **Cambio de Bridge confirmado:** hoy `Bridge` (schema.prisma:426) no tiene
   `empresaId` — no existe vínculo a empresa en absoluto. D1 exige agregarlo
   (1 Bridge = 1 Empresa). Además, todo `Lead` nace hoy de un `LeadRecibido`
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

Implicación de esquema pendiente de diseño (no autorizada por esta nota):
`enum RolUsuario` (`schema.prisma:12`) pierde `VENDEDOR` y pasa a vivir en una
membresía usuario↔empresa con un flag `habilitadoParaVenta`, más un nivel
holding-wide separado para super admin/administrador de holding que no está
atado a una sola empresa. `Lead.asesorId`/`vendedorId` (`schema.prisma:204-205`)
podrían reinterpretarse sin campos nuevos — falta decidir si `vendedorId` se
duplica siempre o solo cuando hay reasignación real a otro asesor.
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

**8.1 — Riesgos de diseño detectados en D3/D5/D8/D9 (QA, no bloquean, deben
resolverse antes de implementar).** Detalle completo, evidencia y resolución
por bloque en `docs/blocks/`:

1. Invariante de `Lead.asesorId` en riesgo si Administrador se autoasigna vía
   la excepción de D9 — ver `docs/blocks/d-routing-oportunidad.md`.
2. Corrección de tecnología: el sistema usa SSE, no websockets
   (`backend/src/lib/event-broker.ts:79`).
3. El SSE es UX, nunca el mecanismo de autorización — ver
   `docs/blocks/c-aislamiento.md`.
4. Condición de carrera D8 (auto-asignación) vs. D9 (excepción manual) — ver
   `docs/blocks/c-aislamiento.md`.
5. `Notificacion` no tiene destinatario por grupo; se resuelve con
   `Membresia` (§8.2) — ver `docs/blocks/c-aislamiento.md`.

**8.2 — Propuesta de fundación: membresía usuario↔empresa↔rol (no aplicada al
esquema todavía; requiere confirmación de los dos supuestos marcados abajo
antes de migrar).**

Alcance deliberado: se modela `Empresa` sola, sin tabla `Holding` todavía. Hoy
hay un solo holding (Arcano); crear `Holding` como entidad recién tiene
sentido cuando D11 (topología física) decida si el holding es una fila de
base de datos compartida o un control plane separado. Agregarla ahora sería
diseñar para un requisito de D11 que todavía no está resuelto.

Esquema Prisma (`Empresa`, `enum RolMembresia`, `Membresia`), los cambios
sobre `Bridge`/`Lead`/`Usuario.rol` que cierran D1/D2, y el razonamiento de
`empresaId: null` para admins de holding: movidos a
`docs/blocks/b-tenant-prisma-foundation.md`. El riesgo QA #5 de §8.1
(destinatario de notificación por grupo) queda cerrado por este mismo
modelo de `Membresia`.

**Supuestos confirmados (2026-08-25):**

1. Super admin y administrador de holding son el **mismo** nivel de
   membresía — es el mismo usuario, no dos roles distintos. `ADMINISTRADOR`
   con `empresaId = null` cubre el caso sin necesitar un rol adicional.
2. Un mismo usuario **sí puede tener varias membresías activas** en
   distintas empresas del holding a la vez, **para cualquier rol** (Asesor,
   Supervisor, Administrador de empresa) — no es exclusivo de Asesor. Aplica
   sobre todo cuando el volumen de leads de una empresa todavía no justifica
   personal dedicado y una misma persona atiende varias empresas.

**Ciclo de vida de la membresía (2026-08-25):**

- Quitar a alguien de una empresa es `Membresia.activa = false` en esa fila,
  nunca un `DELETE` — conserva el historial de auditoría de qué membresía
  autorizó qué acción sobre qué lead.
- `Usuario.activo` (`schema.prisma:46`, ya existente) pasa a recalcularse
  como efecto derivado: se pone en `false` automáticamente cuando el usuario
  se queda sin **ninguna** `Membresia` de empresa activa, y vuelve a `true`
  automáticamente en cuanto se le (re)activa una membresía de empresa —
  la reactivación es literalmente reasignarlo a una empresa, sin recrear el
  usuario ni perder su historial previo.
- Excepción a esa regla: una membresía **holding-wide** (`empresaId = null`,
  ADMINISTRADOR o SUPERVISOR) no depende de tener empresas asignadas — si
  esa membresía sigue activa, el usuario sigue activo aunque pierda todas
  sus membresías de empresa.
- Esto es lógica de aplicación (recalcular `Usuario.activo` al
  activar/desactivar una `Membresia`), no un trigger de base de datos —
  consistente con que el resto de las reglas de negocio del backend ya
  viven en la capa de servicios, no en Postgres.

**8.3 — Ruteo de login sin selector: correo por membresía (propuesta, no
aplicada al esquema).**

Verificado contra el código real: hoy el login
(`backend/src/services/auth.service.ts:63-84`) resuelve un único `Usuario`
por `correo` global — no alcanza para una persona reutilizada en varias
empresas. **Confirmado (2026-08-25): credenciales completamente
independientes por empresa** (comprometer una empresa no expone a las
otras); la identidad de negocio sigue siendo una sola (`Usuario.id`). Diseño
completo (`Membresia.correo`/`passwordHash`, resolución en login,
`RefreshToken.membresiaId`, riesgo de unicidad entre tablas) movido a
`docs/blocks/b-tenant-prisma-foundation.md`. Sin preguntas abiertas en §8.3.

**D10 — Rendimiento de canal — Resuelto (2026-08-25):** métricas
publicitarias reales (Meta Ads primero), cruzadas con la conversión real del
CRM — no solo conteos propios de `Lead`. → ver `docs/blocks/e-dashboards.md`.

**8.4 — Plan de implementación: gestión de campañas + ingreso manual
(propuesta, no aplicada al esquema).**

Dos líneas de trabajo distintas, movidas a los bloques que las implementan:

- **Sincronización de campañas Meta** (job de `Campania`, `Lead.campaniaId`,
  `CampaniaMetricaDiaria`, cálculo de CPC/CPL/CAC, cierre de
  `TOKEN_POR_EXPIRAR`): `docs/blocks/e-dashboards.md`.
- **Ingreso manual de leads y catálogo de canal manual** (`OrigenLead.MANUAL`,
  modelo `CanalManual`, autorización confirmada para Administrador/
  Supervisor/Asesor, unión de `Bridge.redSocial` + `CanalManual.nombre` como
  una sola dimensión de reporte): `docs/blocks/d-routing-oportunidad.md`.

**Confirmado (2026-08-25), se conserva acá por ser decisión de producto, no
diseño de esquema:** en el selector de Bridges, `X` y `LINKEDIN` (3 de 5
valores de `enum RedSocial` desarrollados hoy: Facebook/Instagram/Google
Forms) se restringen por allowlist de aplicación y van comentados en el
código del selector de frontend, no eliminados — sin tocar el schema.

**8.5 — Plan de implementación: exportación de reportes (PDF/XLSX)
(propuesta, no aplicada).**

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
  empresas. Mitigación: centralizar el filtro de empresa en una sola capa
  (servicio/middleware), y considerar Row-Level Security de Postgres como
  defensa adicional — no confiar en que cada consulta lo recuerde por su
  cuenta.
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

**Efecto cascada sobre decisiones ya cerradas — señalado, no resuelto
todavía:** este cambio reabre mecánica (no la decisión de fondo) de D2, D3,
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

**8.6 — Plan de implementación: dashboards de rendimiento (propuesta, no
aplicada).**

Nuevas vistas propuestas sobre `metricas.service.ts` ya existente: embudo
por Oportunidad, rendimiento por producto, cascada Lead→Oportunidad→Venta,
conversión habilitados/no habilitados para venta, ranking de productos por
empresa. Nada de esto se construye antes de que `Oportunidad`/`Producto`
existan en Prisma (Bloque D). Detalle y orden de implementación en
`docs/blocks/e-dashboards.md`.

Todas las decisiones D1–D14 quedaron registradas explícitamente en esta
sección. Ningún tema queda aprobado por aparecer en una cola — cada
resultado debe registrarse antes de cambiar esquema, autorización o
contratos. El efecto cascada de D13 sobre D2/D3/D7/D8/D9, señalado como
pendiente en su momento, quedó resuelto en D14.

**D15 — Importación de datos históricos por empresa — Pendiente, diferido
(2026-08-27): no bloquea Bloque C.**

Contexto verificado: el desarrollo escaló a multitenant (D1-D14) antes de la
primera puesta en producción — no existe hoy ningún `Lead`/`Bridge` con datos
reales de cliente en el ambiente objetivo. La pregunta de qué hacer con filas
`empresaId = null` al cortar a bloqueante en Bloque C queda sin objeto: no hay
filas legacy que backfillear, poner en cuarentena o denegar. Bloque C corta
`empresaId` a obligatorio directamente, sin mecanismo de migración de datos
existentes.

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
- D1 tiene una respuesta explícita antes de diseñar aislamiento.
- Los temas D2–D14 se resuelven en orden y se registran de forma explícita.
- Toda afirmación técnica se contrasta con código y migraciones.
- Los tests runtime futuros se ejecutan únicamente en el entorno Docker aprobado.
- Este documento se actualiza si cambia el código base o se aprueba una decisión.
Esta revisión añadió documentación únicamente. No modificó código, esquema,
dependencias, configuración de runtime ni datos, y no ejecutó tests runtime.
