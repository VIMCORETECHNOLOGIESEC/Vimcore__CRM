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
configuración.

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
  regla de herencia adicional, la membresía ya lo cubre.

**D3 — Cardinalidad de routing por sitio — Resuelto (2026-08-25):** pool por
empresa, no pool global. Candidatos = asesores activos que pertenecen (vía
membresía) a la empresa dueña del bridge de origen del lead. Se conserva el
algoritmo vigente de `docs/02` §3 (menor carga activa, desempate FIFO por
`ultima_asignacion_en` más antigua) — solo cambia el universo de candidatos,
que deja de ser global.

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
el flujo automático de D8, no como reemplazo de él.

Implicación de esquema pendiente de diseño (no autorizada por esta nota):
`enum RolUsuario` (`schema.prisma:12`) pierde `VENDEDOR` y pasa a vivir en una
membresía usuario↔empresa con un flag `habilitadoParaVenta`, más un nivel
holding-wide separado para super admin/administrador de holding que no está
atado a una sola empresa. `Lead.asesorId`/`vendedorId` (`schema.prisma:204-205`)
podrían reinterpretarse sin campos nuevos — falta decidir si `vendedorId` se
duplica siempre o solo cuando hay reasignación real a otro asesor.

**D7 — Competencia sobre `NO_VENTA` — Resuelto (2026-08-25):** solo el asesor
habilitado para venta que tiene el lead asignado en ese momento puede marcar
`VENTA` o `NO_VENTA`. Un asesor no habilitado solo puede avanzar el lead hasta
calificarlo y registrar el primer contacto; no tiene autoridad de cierre. Esto
cierra por construcción el hallazgo P0 de `docs/16` §4.4 ("el responsable
operativo puede cerrar desde etapas no terminales"), una vez implementado.

**D8 — Modalidad del handoff — Resuelto (2026-08-25):** asignación automática
inmediata, sin aceptación manual ni devolución. Al calificar y registrar el
primer contacto, si el asesor actual no está habilitado para venta, el lead
reingresa al pool automático (mismo algoritmo de D3, pool restringido a
asesores habilitados para venta) y se asigna automáticamente al ganador. No
hay paso de aceptación por parte del asesor receptor.

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

**8.1 — Riesgos de diseño detectados en D3/D5/D8/D9 (QA, no bloquean, deben
resolverse antes de implementar):**

1. **Invariante de `Lead.asesorId` en riesgo.** D3 asume que los candidatos de
   carga activa son usuarios con rol `ASESOR`. Si Administrador se autoasigna
   un lead vía la excepción de D9, y ese lead usa el mismo campo `asesorId`,
   cualquier cálculo de carga (D3) o de rendimiento de asesor (D10) que
   asuma esa invariante se corrompe en silencio. Falta decidir si
   Administrador puede ocupar `asesorId` directamente o si necesita un
   marcador separado (ej. `gestionadoPorAdmin`) para excluirse de esos
   cálculos.
2. **Corrección de tecnología:** el sistema NO usa websockets. Verificado en
   `backend/src/lib/event-broker.ts:79` — el tiempo real es **SSE**
   (Server-Sent Events, unidireccional servidor→cliente), no un canal
   bidireccional de "pedir permiso".
3. **El SSE es UX, nunca el mecanismo de autorización.** Siempre existe una
   ventana entre el commit de una reasignación y la llegada del evento SSE al
   navegador del usuario que pierde acceso. Cada endpoint de escritura sobre
   un lead (cerrar, reasignar, agendar cita) debe revalidar en el momento de
   la petición si el usuario sigue siendo el responsable vigente y sigue
   habilitado — nunca confiar en el estado que el frontend tenía cacheado.
4. **Condición de carrera D8 (auto-asignación) vs. D9 (excepción manual).**
   Si el pool automático y una reasignación manual de Administrador ocurren
   casi al mismo tiempo sobre el mismo lead, sin bloqueo/transacción que lea
   el estado vigente antes de escribir, una de las dos se pierde en silencio.
5. **`Notificacion` no tiene destinatario por grupo.** `Notificacion.usuarioId`
   (`schema.prisma:290`) es 1:1 por usuario; no existe "todos los
   supervisores de la Empresa X" ni "todos los supervisores del holding".
   Notificar correctamente depende de que el modelo de membresía
   usuario↔empresa↔rol exista en el esquema — hoy no existe (mismo
   bloqueante ya detectado en la propuesta de recomendación cruzada).

**8.2 — Propuesta de fundación: membresía usuario↔empresa↔rol (no aplicada al
esquema todavía; requiere confirmación de los dos supuestos marcados abajo
antes de migrar).**

Alcance deliberado: se modela `Empresa` sola, sin tabla `Holding` todavía. Hoy
hay un solo holding (Arcano); crear `Holding` como entidad recién tiene
sentido cuando D11 (topología física) decida si el holding es una fila de
base de datos compartida o un control plane separado. Agregarla ahora sería
diseñar para un requisito de D11 que todavía no está resuelto.

```prisma
model Empresa {
  id       String   @id @default(uuid()) @db.Uuid
  nombre   String   @db.Text
  activa   Boolean  @default(true)
  // Confirmado 2026-08-25: hoy SLA_HORAS = 24 es una constante global fija
  // (config/negocio.ts:15). Pasa a ser configurable por empresa, con el
  // mismo valor 24 como default de fábrica — mismo patrón ya usado para
  // VENTANA_REINGRESO_DIAS en D2.
  slaHoras Int      @default(24) @map("sla_horas")
  creadaEn DateTime @default(now()) @map("creada_en") @db.Timestamptz(6)

  bridges    Bridge[]
  membresias Membresia[]
  leads      Lead[]

  @@map("empresas")
}

enum RolMembresia {
  ADMINISTRADOR
  SUPERVISOR
  ASESOR

  @@map("rol_membresia")
}

model Membresia {
  id                  String       @id @default(uuid()) @db.Uuid
  usuarioId           String       @map("usuario_id") @db.Uuid
  // null = alcance holding-wide (super admin / administrador de holding /
  // supervisor de holding). Con empresa = alcance de una sola empresa.
  empresaId           String?      @map("empresa_id") @db.Uuid
  rol                 RolMembresia
  // Solo aplica cuando rol = ASESOR; se valida a nivel de aplicación.
  habilitadoParaVenta Boolean      @default(false) @map("habilitado_para_venta")
  // Soft toggle: quitar a alguien de una empresa es activa=false, nunca
  // DELETE — preserva el historial de qué membresía autorizó cada acción
  // sobre un lead de esa empresa.
  activa              Boolean      @default(true)
  creadaEn            DateTime     @default(now()) @map("creada_en") @db.Timestamptz(6)

  usuario Usuario  @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  empresa Empresa? @relation(fields: [empresaId], references: [id], onDelete: Cascade)

  @@unique([usuarioId, empresaId, rol])
  @@index([empresaId, rol])
  @@map("membresias")
}
```

Cambios sobre modelos existentes:
- `Bridge.empresaId` (nuevo, `NOT NULL`, FK a `Empresa`) — cierra D1.
- `Lead.empresaId` (nuevo, FK a `Empresa`) — cierra la implicación de esquema
  de D2; habilita la unicidad compuesta de "lead abierto" por
  (cliente, empresa).
- `Usuario.rol` y el `enum RolUsuario` (`schema.prisma:12-19`) se retiran por
  completo — toda autorización pasa a resolverse contra `Membresia`, no
  contra un campo plano en `Usuario`.

Por qué `empresaId: null` en vez de una fila por empresa para los admins de
holding: el holding tiene un **pool incremental de empresas que va a
seguir creciendo**. Una membresía holding-wide (`empresaId = null`) cubre
automáticamente cada empresa nueva que se cree, sin necesitar un job que
backfillee membresías cuando nace una empresa.

Esto también cierra el riesgo QA #5 de la nota anterior: "avisarle a todos
los supervisores de la Empresa X" pasa a ser una consulta directa —
`Membresia` con `empresaId = X` y `rol = SUPERVISOR`, más `Membresia` con
`empresaId = null` y `rol IN (ADMINISTRADOR, SUPERVISOR)` para el nivel
holding — sin cambiar el esquema de `Notificacion`.

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

Verificado contra el código real: hoy el login (`backend/src/services/auth.service.ts:63-84`)
resuelve un único `Usuario` por `correo` (`schema.prisma:43`, `@unique`
global) y valida la contraseña contra ese mismo registro — un correo, un
usuario, un rol plano. Esto no alcanza para lo que se pide: la misma persona,
reutilizada en varias empresas, necesita que el correo con el que entra
determine a qué empresa se le rutea, sin pantalla de selección.

**Diseño propuesto:**

- `Membresia.correo` (nuevo, `String? @unique @db.Citext`) y
  **`Membresia.passwordHash` (nuevo, `String?`)** — ambos obligatorios cuando
  `empresaId != null` (login empresa-scoped con **credencial propia e
  independiente**, confirmado 2026-08-25: no comparte contraseña con
  `Usuario` ni con las demás empresas de la misma persona, para que
  comprometer una empresa no exponga a las otras dos). Siempre `null` en
  membresías holding-wide, que siguen usando `Usuario.correo` +
  `Usuario.passwordHash` (el "correo principal").
- **Resolución en login:** dado un correo entrante, se busca primero en
  `Usuario.correo` → si matchea, se valida contra `Usuario.passwordHash`
  (holding-wide). Si no aparece, se busca en `Membresia.correo` con
  `activa = true` → si matchea, se valida contra **el `passwordHash` de esa
  misma fila**, nunca contra el de `Usuario`. Ninguno de los dos →
  credenciales inválidas (mismo mensaje genérico de `invalidCredentials()`,
  sin oráculo de cuentas).
- **`RefreshToken` necesita `membresiaId` nullable** (`schema.prisma:69-84`
  hoy solo tiene `usuarioId`) — nulo si la sesión es holding-wide, con valor
  si nació de una `Membresia` específica. Así `refresh()` sabe qué scope
  reemitir sin tener que re-resolver el correo usado originalmente.
- La **identidad de negocio sigue siendo una sola** (`Usuario.id`): quien
  aparece en `Lead.asesorId`, en auditoría y en el historial compartido de
  D2 sigue siendo la misma persona, sin importar por cuál de sus credenciales
  entró. Lo que se fragmenta por empresa es la credencial de acceso, no la
  identidad de negocio.
- Al reactivar una `Membresia` (`activa = true` de nuevo), el correo y la
  contraseña de esa fila vuelven a funcionar tal cual quedaron — no hace
  falta reemitir nada.
- Implicación operativa: dar de alta a alguien en una nueva empresa ahora
  significa crear su correo **y** una contraseña inicial para esa empresa
  puntual (flujo de invitación/primer acceso), no reutilizar ninguna
  credencial que la persona ya tenga en otro lado del holding.

**Riesgo técnico a resolver en la migración real (no bloquea la propuesta):**
Postgres no puede garantizar unicidad **entre dos tablas** (`Usuario.correo`
vs. `Membresia.correo`) con un solo `UNIQUE`. Hace falta un chequeo a nivel
de aplicación, dentro de una transacción, que verifique que un correo nuevo
no exista ya en la otra tabla antes de crearlo — para que el login nunca
tenga que decidir entre dos coincidencias.

**Confirmado (2026-08-25):** credenciales completamente independientes por
empresa — resuelto arriba. Sin preguntas abiertas en §8.3.

**D10 — Rendimiento de canal — Resuelto (2026-08-25):** métricas
publicitarias reales (Meta Ads primero), cruzadas con la conversión real del
CRM — no solo conteos propios de `Lead`.

**8.4 — Plan de implementación: gestión de campañas + ingreso manual
(propuesta, no aplicada al esquema).**

**Campañas (Meta):** ya existe base útil — `CuentaPublicitaria`
(`tokenCifrado`, `estadoToken`) y `Campania` (`cuentaPublicitariaId`,
`idExterno`, `redSocial`, `@@unique([cuentaPublicitariaId, idExterno])`).
Falta:

1. Job periódico que sincroniza el catálogo de `Campania` desde la Marketing
   API de Meta (upsert por `idExterno`, mismo patrón de idempotencia que
   `LeadRecibido`).
2. `Lead.campaniaId` (nuevo, nullable, FK a `Campania`) — resuelto durante el
   procesamiento de `LeadRecibido` contra `idExternoCampania` del payload.
   Cierra el hallazgo P1 de §4.3 ("Campania existe, pero la ingesta no la
   materializa ni la enlaza al lead").
3. `CampaniaMetricaDiaria` (nueva: `campaniaId`, `fecha`, `gasto`,
   `impresiones`, `clics`, `alcance`) — serie diaria, no un acumulado en
   `Campania`, para poder ver tendencia. Otro job trae esto de la Insights
   API de Meta.
4. CPC/CPL/CAC se calculan al vuelo cruzando `CampaniaMetricaDiaria` con
   conteos de `Lead` por `campaniaId`/`etapa = VENTA` — no se guardan como
   columna, se desactualizarían.
5. El mismo job de sincronización marca `CuentaPublicitaria.estadoToken`
   como expirado si Meta rechaza el token — cierra de paso la alerta
   `TOKEN_POR_EXPIRAR` (P1, §4.3, sin productor idempotente).

Aviso: la integración con la Marketing API de Meta (OAuth, scopes por
página, rate limits) es trabajo de integración real — se recomienda tratarla
como su propia etapa, no como "un job más".

**Ingreso manual de leads:**

- Nuevo endpoint de creación manual, sin pasar por `LeadRecibido` ni Bridge
  — mismo patrón sin-bridge que la recomendación cruzada.
- `OrigenLead` (`schema.prisma:86-91`, hoy `NUEVO | REINGRESO`) gana
  `MANUAL` (además de `RECOMENDACION`, ya anotado antes): queda
  `NUEVO | REINGRESO | RECOMENDACION | MANUAL`.
- **Autorización confirmada (2026-08-25): Administrador, Supervisor y
  Asesor** pueden cargar un lead manual — no queda reservado a un solo rol.
  Requiere `Membresia` activa en la empresa destino (misma regla de D4).
- Reutiliza sin cambios la dedup de D2 (mismo `Cliente` por teléfono, mismo
  chequeo de lead abierto por empresa) y el auto-assignment de D3 — nadie
  elige asesor a mano al cargarlo, entra al pool como cualquier otro lead.
- `redSocial` queda opcional/null — un ingreso manual (llamada, presencial)
  no siempre tiene una red de origen.

**Listas dinámicas de canal manual, por empresa (2026-08-25):**

Verificado: `enum RedSocial` (`schema.prisma:372-380`) tiene 5 valores
(`FACEBOOK, INSTAGRAM, X, LINKEDIN, GOOGLE_FORMS`), pero según §4.3 solo
Facebook/Instagram/Google Forms están realmente desarrollados — X y LinkedIn
existen en el enum pero sin adaptador funcional. Dos selectores distintos,
dos fuentes de datos distintas:

1. **Selector de Bridges (al configurar un bridge):** se restringe por una
   allowlist de aplicación (ej. `BRIDGES_DESARROLLADOS = [FACEBOOK,
   INSTAGRAM, GOOGLE_FORMS]`), no por el enum completo. El enum se queda con
   sus 5 valores tal cual (`X`/`LINKEDIN` siguen en el backlog diferido de
   §5) — no hace falta tocar el schema, solo filtrar en la capa de
   aplicación qué se puede *elegir* al crear un Bridge.
   - **Confirmado (2026-08-25):** en el listado de opciones del selector
     (frontend), `X` y `LINKEDIN` van **comentados en el código**, no
     eliminados ni removidos del array de opciones — para no confundir al
     usuario final con un canal que todavía no funciona (3 de 5 bridges
     desarrollados hoy), y para que activarlos más adelante sea descomentar
     una línea, no reconstruir la opción desde cero.
2. **Canal de ingreso manual (nuevo, dinámico, por empresa):** el
   `enum RedSocial` no sirve acá — es fijo y cerrado, y cada empresa puede
   necesitar canales que nunca van a tener bridge (referido, llamada, feria,
   TikTok antes de tener adaptador). Nueva tabla:

```prisma
model CanalManual {
  id        String   @id @default(uuid()) @db.Uuid
  empresaId String   @map("empresa_id") @db.Uuid
  nombre    String   @db.Text
  activo    Boolean  @default(true)
  creadoEn  DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)

  empresa Empresa @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  leads   Lead[]

  @@unique([empresaId, nombre])
  @@map("canales_manuales")
}
```

- `Lead.canalManualId` (nuevo, nullable, FK a `CanalManual`) — se usa
  únicamente cuando `origen = MANUAL`; mutuamente excluyente con `redSocial`
  (que sigue siendo exclusivo de leads con bridge de origen real).
- **Gestión del catálogo — confirmado (2026-08-25):** alta/edición/baja de
  canales manuales queda en manos de Administrador (de empresa u holding),
  igual que la gestión de Bridges. Supervisor y Asesor solo **eligen** de la
  lista al cargar un lead manual, sin poder editarla. El catálogo es propio
  de cada empresa — cada una puede definir sus propios canales manuales sin
  afectar a las demás.
- **Dashboards, filtros y selectores de "red social":** para que un reporte
  por canal muestre todo junto, la capa de reporting debe unir dos fuentes
  por empresa — los `Bridge.redSocial` realmente configurados, más los
  `CanalManual.nombre` activos de esa empresa — como una sola dimensión de
  canal. Los canales manuales, al no tener `CuentaPublicitaria`/`Campania`
  detrás, naturalmente no van a tener CPC/CPL/CAC (D10/§8.4) — eso es
  esperado, no un defecto.

**8.5 — Plan de implementación: exportación de reportes (PDF/XLSX)
(propuesta, no aplicada).**

Verificado contra el código real: `backend/src/controllers/metricas.controller.ts`
ya expone `getMetricasResumen`, `getMetricasPorRedSocial`,
`getMetricasPorAsesor`, `getMetricasPorEtapa`, `getMetricasPorCampania`,
`getMetricasEmbudo` y `getMetricasRedSocialXSemaforo` — la agregación de
datos ya existe. Exportar no es reinventar esas consultas, es agregar una
capa de renderizado encima de los mismos servicios.

**Dónde generar el archivo — en el backend, no en el navegador:**

- Reutiliza exactamente los mismos servicios de agregación que ya alimentan
  el dashboard — cero lógica de negocio duplicada.
- La autorización por empresa (D4/D6) se aplica una sola vez, en el
  servidor — un reporte nunca sale de la API con datos de una empresa a la
  que el que lo pide no tiene acceso.
- Prepara el terreno para automatizarlo después (ej. "mandame el PDF
  mensual por correo") sin rediseñar nada.

**PDF — presentación comercial:**

- Recomendado: plantilla HTML/CSS renderizada a PDF (ej. vía Puppeteer/
  Chromium headless), no ensamblado de formas de bajo nivel — da control de
  diseño real (portada, tipografía, marca) en vez de un PDF que se ve a
  "reporte de sistema".
- **Compatibilidad de dispositivo, aclarada (2026-08-25):** Chromium corre
  **en el servidor**, no en el dispositivo del usuario — quien pide el PDF
  no necesita Chrome ni nada instalado, solo hace un request HTTP. El
  archivo resultante es un PDF estándar, abrible en cualquier dispositivo
  (celular, tablet, escritorio) con cualquier lector — cero dependencia de
  Chromium del lado del cliente. Lo único que importa del lado servidor es
  que la imagen Docker del backend incluya Chromium (coherente con la
  política container-only ya señalada en §4.1).
- Gráficos (embudo, barras por canal, tendencia) se generan como imagen/SVG
  server-side e incrusta en la plantilla.
- Estructura sugerida: portada (empresa u holding según el scope del
  reporte, período, quién lo generó) → resumen ejecutivo con los KPIs
  principales (leads totales, tasa de conversión, monto vendido, tiempo
  promedio de cierre) → embudo → rendimiento por canal (con CPC/CPL/CAC de
  D10 cuando el canal tiene Bridge real) → rendimiento por asesor (solo si
  el rol de quien lo pide tiene visibilidad, D6) → si es reporte holding-wide,
  desglose por empresa antes del consolidado.
- **Acceso confirmado (2026-08-25):** solo **Supervisor** y **Administrador**
  (empresa u holding) pueden generar/ver/extraer el reporte general —
  **Asesor no**.
- **Elementos configurables por defecto (nuevo, propuesta):**

```prisma
model ConfiguracionReporte {
  id            String   @id @default(uuid()) @db.Uuid
  // null = configuración default a nivel holding; con valor = override de
  // esa empresa puntual.
  empresaId     String?  @map("empresa_id") @db.Uuid
  secciones     Json     @db.JsonB
  actualizadoEn DateTime @updatedAt @map("actualizado_en") @db.Timestamptz(6)

  empresa Empresa? @relation(fields: [empresaId], references: [id], onDelete: Cascade)

  @@unique([empresaId])
  @@map("configuraciones_reporte")
}
```

  Resolución al generar un reporte: buscar `ConfiguracionReporte` de esa
  empresa; si no existe, usar la fila `empresaId = null` (default del
  holding); si tampoco existe, usar los valores por defecto de fábrica.
  Administrador de holding define el default; Administrador de empresa
  puede sobreescribirlo para la suya — mismo patrón jerárquico ya usado en
  Membresia (§8.2).

**XLSX — estructurado para análisis propio, confirmado (2026-08-25):**

- `exceljs`. Una hoja por métrica (resumen, por canal, por asesor, por
  etapa, por campaña, embudo) — datos crudos y formateados (moneda,
  porcentaje), con resúmenes ejecutivos concretos en varias hojas.
- **Decisión firme: sin gráficos nativos de Excel**, ni ahora ni como mejora
  futura — el objetivo es el dato estructurado bien presentado, no
  replicar visualizaciones dentro del propio Excel.

**Generación asincrónica con progreso por SSE (2026-08-25):**

```prisma
enum EstadoReporteJob {
  PENDIENTE
  PROCESANDO
  LISTO
  ERROR

  @@map("estado_reporte_job")
}

model ReporteJob {
  id           String           @id @default(uuid()) @db.Uuid
  usuarioId    String           @map("usuario_id") @db.Uuid
  tipo         String           // "pdf" | "xlsx"
  parametros   Json             @db.JsonB
  estado       EstadoReporteJob @default(PENDIENTE)
  archivoUrl   String?          @map("archivo_url")
  error        String?          @db.Text
  creadoEn     DateTime         @default(now()) @map("creado_en") @db.Timestamptz(6)
  finalizadoEn DateTime?        @map("finalizado_en") @db.Timestamptz(6)

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@index([usuarioId, estado])
  @@map("reporte_jobs")
}
```

- **Bloqueo de generación duplicada:** antes de crear un `ReporteJob` nuevo,
  se busca si ese usuario ya tiene uno en `PENDIENTE`/`PROCESANDO` (mismo
  tipo/parámetros) — si existe, se devuelve ESE job en vez de crear uno
  nuevo. Así un doble clic o un reintento mientras se genera no dispara una
  segunda generación; el botón simplemente refleja el job ya en curso.
- **Flujo UI/UX:** clic en "Generar PDF" → el botón pasa a estado
  "Generando…" (deshabilitado, con spinner) → se escucha por el mismo canal
  SSE ya existente (`event-broker.ts`) los eventos nuevos `reporte.iniciado`
  / `reporte.listo` / `reporte.error` de ese job → al llegar `reporte.listo`,
  aparece una notificación/toast con botón de **Descargar** habilitado
  (`archivoUrl`) → si llega `reporte.error`, se muestra el error y el botón
  vuelve a "Generar" (ahí sí se libera el bloqueo, porque el estado deja de
  ser `PENDIENTE`/`PROCESANDO`).
- **Resincronización:** además del SSE, un endpoint simple (`GET
  /reportes/jobs/activo`) permite que el frontend recupere el estado actual
  si el usuario recarga la página o reconecta — nunca depender solo del
  evento en vivo para saber si su reporte sigue en curso o ya está listo.

**Aviso de performance:** para un holding con muchas empresas y volumen alto
de leads, generar el PDF de forma síncrona sería lento (más aún con
Puppeteer) — por eso el diseño de arriba ya es asincrónico desde el
principio, no un parche posterior.

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

**D12 — Integraciones compartidas — Resuelto (2026-08-25):** sin ownership
compartido entre empresas — cada empresa registra y mantiene sus propias
credenciales, siempre, aunque la cuenta publicitaria real de Meta detrás sea
la misma para varias empresas del holding.

- **No hace falta ningún cambio de esquema.** Verificado:
  `CuentaPublicitaria` (`schema.prisma:484`) ya tiene
  `@@unique([bridgeId, idExterno])` — único **por bridge**, no globalmente
  por `idExterno`. Una vez que `Bridge` tenga `empresaId` (D1), el mismo
  `idExterno` de Meta ya puede registrarse en más de una fila
  (una por empresa) sin conflicto — es exactamente lo que se pidió.
- Cada empresa configura su propio `tokenCifrado` para "su copia" de esa
  cuenta, aunque apunte al mismo `idExterno` real. Si el token de Meta se
  renueva, hay que actualizarlo en cada fila por separado — es el costo
  operativo aceptado a cambio de aislamiento total entre empresas, mismo
  criterio que ya se aplicó a las credenciales de login por empresa (§8.3).

**D13 — Límite Lead→Oportunidad — Resuelto (2026-08-25):** un mismo cliente
puede tener **varias negociaciones de venta en paralelo dentro de la misma
empresa** (ej. seguro de auto y seguro de vida a la vez), cada una habilitada
según el proceso de compra que corresponda. `Lead` (el contacto) y
`Oportunidad` (cada negociación) dejan de ser la misma fila.

```prisma
model Oportunidad {
  id                String     @id @default(uuid()) @db.Uuid
  leadId            String     @map("lead_id") @db.Uuid
  // Flag/indicador pedido explícitamente: a qué negociación corresponde
  // esta oportunidad dentro del mismo lead.
  productoServicio  String?    @map("producto_servicio") @db.Text
  etapa             EtapaLead  @default(NUEVO)
  semaforo          Semaforo?
  puntuacion        Int?
  asesorId          String?    @map("asesor_id") @db.Uuid
  vendedorId        String?    @map("vendedor_id") @db.Uuid
  montoVenta        Decimal?   @map("monto_venta") @db.Decimal(12, 2)
  observacionCierre String?    @map("observacion_cierre") @db.Text
  formaPago         FormaPago? @map("forma_pago")
  cerradaEn         DateTime?  @map("cerrada_en") @db.Timestamptz(6)
  creadaEn          DateTime   @default(now()) @map("creada_en") @db.Timestamptz(6)

  lead    Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  asesor  Usuario? @relation("OportunidadAsesor", fields: [asesorId], references: [id], onDelete: SetNull)
  vendedor Usuario? @relation("OportunidadVendedor", fields: [vendedorId], references: [id], onDelete: SetNull)

  @@map("oportunidades")
}
```

- Los campos que hoy viven en `Lead` (`etapa`, `semaforo`, `puntuacion`,
  `asesorId`/`vendedorId` como responsables de venta, `montoVenta`,
  `observacionCierre`, `formaPago`, `cerradoEn`) se **mueven a
  `Oportunidad`** — cada negociación tiene su propio semáforo, su propio
  monto, su propio avance.
- `Lead` queda como el contacto: `clienteId`, `empresaId`, `origen`,
  `redSocial`/`canalManualId`, `campaniaId`, `ingresadoEn`, y el asesor del
  **primer contacto/calificación inicial** — no necesariamente el mismo
  asesor de cada `Oportunidad` derivada (un especialista distinto puede
  llevar una negociación puntual).

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
  por un catálogo real, mismo patrón que `CanalManual` (§8.4):

```prisma
model Producto {
  id        String   @id @default(uuid()) @db.Uuid
  empresaId String   @map("empresa_id") @db.Uuid
  nombre    String   @db.Text
  activo    Boolean  @default(true)
  creadoEn  DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)

  empresa       Empresa       @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  oportunidades Oportunidad[]

  @@unique([empresaId, nombre])
  @@map("productos")
}
```

  `Oportunidad.productoId` (FK a `Producto`, reemplaza `productoServicio`
  de D13) — un selector de catálogo es más simple de usar que texto libre
  para alguien sin experiencia en CRM, y habilita dedup exacto y reporting
  agregado sin normalizar strings. Gestión del catálogo: mismo criterio que
  `CanalManual` — alta/edición/baja en manos de Administrador (de empresa u
  holding); Supervisor y Asesor solo eligen.

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
  nuevo.** Confirmado (2026-08-25): se reutiliza exactamente el mecanismo
  ya implementado para `Lead` (`backend/src/services/sla.calculator.ts`,
  `SLA_HORAS` de `config/negocio.ts`) — reloj continuo desde la asignación
  del responsable hasta el cierre, cuatro estados (`sin_iniciar`,
  `a_tiempo`, `en_riesgo`, `atrasado`), detenido en `cerradoEn` para que un
  registro cerrado no siga empeorando con el paso del tiempo. Se replica
  sobre `Oportunidad`, no se inventa una métrica de "primer avance de
  etapa": `Oportunidad.slaInicioEn` (nuevo, nullable, mismo criterio que
  `Lead.slaInicioEn` — nulo hasta que haya responsable asignado, vía
  autoasignación o vía pool) y `Empresa.slaOportunidadHoras` (nuevo, `Int`
  `@default(24)`, mismo patrón de configuración por empresa que
  `Empresa.slaHoras`) alimentan el mismo `calculateEstadoSla(slaInicioEn,
  cerradaEn, ahora)` ya existente, sin duplicar la función.

- **D7 — sin cambios.** La regla ya estaba anclada al "responsable vigente
  de ese registro", no a cómo llegó a serlo — que el responsable se haya
  fijado por autoasignación (D3) o por el pool no altera quién tiene
  autoridad de cierre una vez asignado.

- **D8 — ejemplo de flujo manual, confirmado:**
  1. El asesor está en el detalle de un Lead ya en gestión (ej. etapa
     `CONTACTADO`).
  2. Ve un botón **"+ Nueva oportunidad"**, visible en cualquier etapa del
     Lead, no solo al calificar.
  3. Al hacer clic, elige un **Producto** del catálogo de la empresa dueña
     del Lead (ej. "Seguro de auto", "Seguro de vida").
  4. Si ya existe una Oportunidad **abierta** en ese Lead para el mismo
     producto, no se crea una nueva: mensaje explícito ("Ya existe una
     oportunidad abierta de Seguro de Auto para este lead") con acción
     directa **"Ir a la oportunidad existente"** — nunca un bloqueo mudo.
  5. Si no hay conflicto, se crea. Si el asesor que la crea está habilitado
     para venta, se autoasigna (D3) y ve "Oportunidad asignada a vos". Si
     no, entra al pool de D3 y se asigna automáticamente al asesor
     habilitado con menor carga de esa empresa; notificación SSE al
     ganador.
  6. La nueva Oportunidad aparece en el listado de Oportunidades del Lead
     (badge de conteo en el detalle del Lead), sin tocar etapa ni semáforo
     de otras Oportunidades abiertas del mismo Lead.

- **D9 — conviven dos listados, con pools de asignación masiva distintos:**
  el listado de **Lead** (vista de contactos, con badge de cuántas
  Oportunidades abiertas tiene cada uno) y el listado de **Oportunidad**
  (una fila por negociación, con su propia etapa/semáforo/asesor) coexisten
  como pestañas separadas — ninguno reemplaza al otro, para no imponerle al
  asesor un cambio de pantalla principal. Reglas de asignación masiva,
  confirmado (2026-08-25): desde el listado de Lead, el destino puede ser
  cualquier asesor activo con membresía en la empresa (el primer contacto
  lo puede llevar cualquiera); desde el listado de Oportunidad, el destino
  solo puede ser un asesor con `habilitadoParaVenta = true` en esa empresa
  — el sistema no deja elegir como destino masivo a alguien no habilitado,
  porque D7/D8 exigen que el responsable de una Oportunidad lo esté. La
  excepción auditada de Admin/Supervisor (D9 ya resuelto) no cambia de
  titularidad, solo se le suma este filtro de pool según qué listado se
  esté usando.

**8.6 — Plan de implementación: dashboards de rendimiento (propuesta, no
aplicada).**

Verificado contra `backend/src/controllers/metricas.controller.ts`: hoy
expone `getMetricasResumen`, `getMetricasPorRedSocial`,
`getMetricasPorAsesor`, `getMetricasPorEtapa`, `getMetricasPorCampania`,
`getMetricasEmbudo` y `getMetricasRedSocialXSemaforo`, todos anclados a
`Lead.etapa/semaforo/cerradoEn/asesorId`, con actualización en vivo por SSE
(`metricas.actualizadas`). Con `Oportunidad`/`Producto` ya decididos
arriba, faltan:

1. **Embudo por Oportunidad**, separado del embudo de Lead existente — un
   Lead puede seguir en `CONTACTADO` mientras ya tiene una Oportunidad en
   `CITA`. Se muestran ambos, etiquetados "embudo de contacto" vs. "embudo
   de negociación".
2. **Rendimiento por producto** — mismo patrón que "por campaña" hoy, pero
   agrupado por `Producto`.
3. **Cascada Lead → Oportunidad → Venta** — cuántos Leads llegan a tener al
   menos una Oportunidad abierta, y de esos cuántos cierran en venta.
4. **Habilitados vs. no habilitados para venta** — conversión comparada
   según `habilitadoParaVenta`, mide la eficiencia del handoff de D8.
5. Ranking de productos por empresa, una vez exista multiempresa en código.

Toda agregación nueva vive en `metricas.service.ts` — el mismo service que
ya alimenta el dashboard y que §8.5 exige reutilizar para el export
PDF/XLSX, para no duplicar la lógica en dos lugares. Prioridad de
implementación (orden técnico, menor esfuerzo primero, confirmado
2026-08-25): primero los ítems 1 y 2 (extensión directa de gráficos ya
existentes); después 3 y 4 (agregación cruzada nueva); el filtro por
empresa del ítem 5 queda para la Fase 3 del plan por fases (§7, fundación
tenant) porque `empresaId` todavía no existe en el esquema. Nada de esto se
construye antes de que `Oportunidad`/`Producto` existan en Prisma.

Todas las decisiones D1–D14 quedaron registradas explícitamente en esta
sección. Ningún tema queda aprobado por aparecer en una cola — cada
resultado debe registrarse antes de cambiar esquema, autorización o
contratos. El efecto cascada de D13 sobre D2/D3/D7/D8/D9, señalado como
pendiente en su momento, quedó resuelto en D14.

## 9. Criterio de entrega a otro equipo

- El equipo receptor distingue hechos AS-IS de propuestas TO-BE.
- D1 tiene una respuesta explícita antes de diseñar aislamiento.
- Los temas D2–D14 se resuelven en orden y se registran de forma explícita.
- Toda afirmación técnica se contrasta con código y migraciones.
- Los tests runtime futuros se ejecutan únicamente en el entorno Docker aprobado.
- Este documento se actualiza si cambia el código base o se aprueba una decisión.
Esta revisión añadió documentación únicamente. No modificó código, esquema,
dependencias, configuración de runtime ni datos, y no ejecutó tests runtime.
