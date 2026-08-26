# 14 — Evolución multiempresa y multitenant (arquitectura candidata; decisiones resueltas en docs/16)

> **Estado:** arquitectura candidata para discusión técnica. Las decisiones
> D1–D14 que este documento planteaba como cola abierta (§16) ya están
> **resueltas** en [`16-hallazgos-y-preguntas.md`](16-hallazgos-y-preguntas.md)
> §8 (2026-08-25) — esa es la fuente de estado vigente, no este documento. Este
> archivo conserva valor como referencia de arquitectura (glosario,
> alternativas evaluadas, plan de migración por fases) pero no reemplaza el
> MVP vigente ni autoriza implementación por sí solo: la migración de esquema
> y código sigue pendiente.

La evolución propuesta separa tres conceptos que hoy están fusionados: el límite
de seguridad del cliente, las empresas que opera y las fuentes que originan
leads. **Resuelto (D1, `docs/16` §8):** el holding es el tenant, con las
empresas como unidades internas — dejó de ser una recomendación provisional.

## 1. Snapshot verificado

| Dato | Valor verificado |
|---|---|
| Fecha de corte | 2026-08-25 |
| Entorno de análisis | Worktree dedicado de la rama `test/gpt` |
| Rama | `test/gpt` |
| Upstream | `origin/test/gpt` |
| Commit analizado | `e70b3a45402d8f258016a218ca87825ffd78af7f` |
| Commit corto | `e70b3a4` |
| Mensaje | `fix(codex): corregir rutas duplicadas en model_instructions_file` |
| Estado antes de crear este documento | limpio y sincronizado con upstream |

Este documento describe el **TO-BE candidato** contrastado con ese snapshot. El
estado AS-IS y los pendientes verificables del MVP continúan en
[`06-modulos-backend.md`](06-modulos-backend.md) y
[`07-modulos-frontend.md`](07-modulos-frontend.md).

## 2. Lectura rápida

1. **Holding y tenant no son sinónimos por definición.** Primero debe elegirse
   si el holding es la frontera de seguridad o si coordina empresas aisladas.
2. **Empresa debe ser el scope funcional inequívoco del lead.** La propiedad
   no puede inferirse de nombres de campaña, del payload ni del usuario
   conectado; la clave física depende de D1.
3. **Fuente debe ser la unidad concreta de routing.** Un bridge puede resolver
   varias Páginas, cuentas o formularios con equipos distintos.
4. **Rol no basta para autorizar.** La decisión requiere capacidad, alcance de
   membresía, propiedad del recurso, elegibilidad y estado del flujo.
5. **Primer contacto y traspaso necesitan reglas persistidas.** La etapa por sí
   sola no prueba quién hizo el contacto ni habilita un cierre; su contrato
   final depende de D7 y D8.
6. **La migración debe ser aditiva y condicionada por D1.** Primero se crean
   los scopes legacy, luego se hace backfill, dual-read o dual-write y
   finalmente se endurecen las restricciones acordadas.

## 3. Baseline AS-IS que condiciona la evolución

| Área | Comportamiento actual | Consecuencia para el TO-BE |
|---|---|---|
| Despliegue | Una instancia y base por empresa | No existe una frontera tenant modelada |
| Usuario | Correo único, un `RolUsuario` global y un único estado activo | No soporta roles o bajas por empresa |
| Visibilidad | Administrador y supervisor ven todo; asesor y vendedor ven su cartera | El acceso total no tiene scope empresarial |
| Asignación | Pool global por rol, menor carga y desempate FIFO | Un asesor podría recibir leads de otra empresa o fuente |
| Deduplicación | Teléfono único global; respaldo por correo; lead abierto global por cliente | Una persona podría mezclar oportunidades de empresas distintas |
| Lead y recepción | `Lead` no tiene ownership empresarial ni atribución directa a fuente, cuenta o campaña; `LeadRecibido` registra `bridgeId` y, al resolverse, `leadId` | Existe trazabilidad indirecta `LeadRecibido.bridgeId -> LeadRecibido.leadId`, pero no una atribución singular y canónica de Fuente, Cuenta externa o Campaña en el lead |
| Bridge | Un `RedSocial` y varias `CuentaPublicitaria` | La instancia técnica no equivale siempre a la unidad de routing |
| Campaña | Existe el modelo `Campania`, pero producción no lo materializa ni lo enlaza a `Lead` | Los reportes consultan nombre de campaña dentro de JSON |
| Handoff | No se traspasa un lead en `NUEVO`; el asesor queda read-only tras el traspaso | La separación es parcial, sin primer contacto explícito |
| Cierre | `NUEVO` y `CONTACTADO` permiten salto directo a `VENTA` o `NO_VENTA` | Un asesor puede cerrar una venta mientras todavía es responsable |
| Métricas | Scope por responsable, red, campaña JSON y fechas | No hay drill-down por holding, empresa, sitio o fuente |
| Tiempo real | Notificaciones por usuario y broadcast global de invalidación de métricas | Los destinatarios y señales deben quedar acotados por tenant |

## 4. Glosario objetivo

| Término | Definición propuesta |
|---|---|
| **Holding / Organización** | Grupo cliente que reúne una o más empresas. Es candidato a tenant, no una certeza aprobada |
| **Tenant** | Frontera de aislamiento, administración y ciclo de vida. Ningún dato cruza esta frontera sin un mecanismo federado explícito |
| **Empresa** | Subsidiaria, marca operativa o unidad comercial propietaria del proceso comercial y sus resultados |
| **Activo de captación** | Concepto paraguas para sitio, dominio, Página social, cuenta externa, formulario o conexión configurada que origina captaciones. No sustituye la unidad concreta de routing |
| **Sitio** | Propiedad web de una empresa, identificada por dominio y configuración de captación |
| **Canal** | Clasificación comercial del origen, por ejemplo Facebook, Instagram, LinkedIn, X, sitio web o Google Forms |
| **Adaptador** | Implementación reutilizable que traduce el contrato técnico de un proveedor. Es código, no una conexión configurada ni una unidad de ownership |
| **Bridge** | Conexión configurada o instancia operativa que usa un adaptador para autenticar, recibir o consultar datos de un proveedor. Su asociación empresarial queda condicionada por D12 |
| **Fuente** | Unidad concreta y enrutable que origina una captación y se resuelve en el contexto de un bridge, por ejemplo una Página Meta, un formulario, una cuenta LinkedIn o un endpoint de sitio |
| **Cuenta externa** | Identidad del proveedor relacionada con un bridge o fuente. El modelo actual `CuentaPublicitaria` cumple parte de esta función |
| **Campaña** | Campaña externa o atribuida bajo una fuente y cuenta externa |
| **Captación** | Cada envío o interacción entrante normalizada, conservando su procedencia aunque se vincule a un lead existente |
| **Cliente / Contacto** | Persona identificada dentro de la frontera de deduplicación que se acuerde |
| **Lead** | Intento de prospección y calificación asociado a un contacto, dentro del scope de una empresa |
| **Oportunidad** | Proceso comercial aceptado para seguimiento de cierre e ingreso después del handoff semántico |
| **Membresía** | Relación activa de un usuario con el tenant, empresa o equipo autorizado |
| **Rol / capacidad** | Conjunto de acciones permitidas dentro del scope de una membresía; su cardinalidad depende de D5 |
| **Elegibilidad** | Restricción adicional que habilita recibir leads de fuentes concretas |
| **Equipo** | Agrupación operativa de membresías dentro de una empresa |

## 5. Frontera tenant — alternativas evaluadas (D1, resuelta en docs/16 §8)

### Alternativa A — Holding como tenant

```text
Tenant: Holding
└── Empresa A
└── Empresa B
└── Empresa C
```

El administrador del holding puede consolidar y comparar empresas porque todas
pertenecen a la misma frontera de seguridad. Supervisores, asesores y vendedores
reciben scopes empresariales explícitos.

| Ventaja | Coste o límite |
|---|---|
| Resuelve directamente el caso de uso del holding | Las empresas no tienen aislamiento de tenant entre sí |
| Dashboard consolidado y drill-down simples | Requiere reglas claras para contactos compartidos |
| Una identidad de usuario puede pertenecer a varias empresas | Un error de scope empresarial sigue siendo una exposición interna |
| Permite una base aislada por holding durante la primera evolución | No equivale a SaaS de múltiples holdings en una base compartida |

### Alternativa B — Empresa como tenant y holding como federación

```text
Holding federado
├── Tenant: Empresa A
├── Tenant: Empresa B
└── Tenant: Empresa C
```

Cada empresa es una frontera independiente. El holding no obtiene acceso por una
relación jerárquica ordinaria: requiere grants federados y una capa de consulta
que combine resultados ya autorizados.

| Ventaja | Coste o límite |
|---|---|
| Máximo aislamiento legal y operativo entre empresas | El administrador del holding cruza tenants mediante una excepción explícita |
| Dedupe, secretos y retención pueden variar por empresa | Dashboard consolidado requiere federación o almacén analítico |
| Facilita separar o vender una empresa sin migrar sus datos | Identidad, permisos y navegación son más complejos |
| Reduce el impacto de una fuga de scope empresarial | Mayor coste de operación, pruebas y soporte |

### Decisión (D1, `docs/16` §8 — Resuelto 2026-08-25)

**Holding como tenant**, con Empresa como scope obligatorio de operación —
confirmado para el caso piloto Arcano. Las alternativas de arriba quedan como
referencia de por qué se descartó la federación por empresa, no como opciones
todavía abiertas.

La alternativa federada es más adecuada cuando cada empresa exige aislamiento
contractual, retención independiente o separación administrativa fuerte.

La ubicación física de datos es otra decisión: ambas fronteras pueden
implementarse inicialmente con una base por tenant y, posteriormente, con un
esquema compartido endurecido. No se debe confundir modelo de dominio con
topología de despliegue.

## 6. Jerarquía de dominio propuesta

```text
Holding
└── Empresa
    ├── Equipo
    └── Activo de captación
        ├── Sitio
        ├── Bridge (conexión configurada)
        └── Fuente (unidad enrutable)
            ├── Cuenta externa, cuando aplique
            └── Campaña

Usuario
├── Membresía de holding o federación, según D1
└── Membresía de empresa
    ├── Rol o capacidades, con cardinalidad según D5
    └── Elegibilidades de fuente

Cliente / Contacto
└── Lead (prospección y calificación)
    ├── Captación
    │   └── Bridge + Fuente + Campaña + Sitio, cuando apliquen
    └── Handoff semántico
        └── Oportunidad (representación física pendiente en D13)
```

El diagrama expresa agrupación y trazabilidad, no una cardinalidad física ya
aprobada. En particular, la relación entre Empresa, Bridge y Fuente depende de
D12 cuando una conexión o credencial sirve a más de una empresa.

### Reglas candidatas de propiedad y atribución

- Una **Empresa** es el scope funcional inequívoco de cada lead, cualquiera sea
  la frontera tenant elegida en D1.
- D1 determina si el registro necesita una clave de tenant holding además del
  scope empresarial, o si la empresa ya constituye la frontera tenant.
- Como valor predeterminado candidato sujeto a D12, un **Bridge** queda asociado
  a una sola empresa. Si una conexión sirve a varias empresas, se requieren
  asociaciones o grants explícitos; no se debe inferir ownership por la
  credencial.
- Cada **Fuente** debe resolverse de forma inequívoca dentro del contexto
  autenticado. La cardinalidad Bridge–Fuente y el tratamiento de fuentes
  compartidas quedan condicionados por D12.
- Un **Sitio** puede asociarse a una o varias fuentes, pero no es obligatorio
  para fuentes publicitarias que no representen una propiedad web.
- Una **Campaña** se atribuye a una fuente o cuenta externa. Nombres homónimos no
  fusionan campañas.
- Una **Captación** conserva la atribución de cada ingreso. El lead puede exponer
  una fuente inicial o principal para lectura rápida, pero no reemplaza el
  historial de captaciones.
- La empresa del lead se resuelve desde la conexión autenticada y el mapeo
  configurado de la fuente. Nunca se acepta desde el payload externo como dato
  autoritativo.

### Evolución del modelo actual

- `CuentaPublicitaria` debería evolucionar conceptualmente a una cuenta o
  fuente externa; para Meta representa una Página, no una cuenta publicitaria.
- `RedSocial` debería dejar de ser la única taxonomía de origen, porque un
  sitio web no es una red social.
- `LeadRecibido` conserva un payload JSON validado y un sobre durable e
  idempotente de procesamiento. Esto no implica conservar byte a byte el cuerpo
  HTTP original.
- El vínculo `LeadRecibido.bridgeId -> LeadRecibido.leadId` ya permite
  reconstruir procedencia indirecta por recepción. La brecha es no disponer de
  una atribución singular y canónica de Fuente, Cuenta externa o Campaña para el
  lead.
- Una captación normalizada permite reportar múltiples interacciones sin
  sobrescribir el origen inicial del lead.
- La relación canónica elegida para campaña debe materializarse; filtrar por el
  JSON persistido en `payloadOriginal.nombreCampania` no es una base suficiente
  para el dashboard objetivo.

### Dirección de diseño Lead→Oportunidad

Este TO-BE adopta una separación **semántica**: Lead cubre prospección y
calificación; Oportunidad cubre el proceso aceptado para cierre e ingreso. El
benchmark de mercado fundamenta el vocabulario, pero no obliga a copiar una
tabla o pipeline externo.

La representación **física** permanece pendiente en D13 entre entidades
separadas o un agregado que conserve el embudo actual con fases y ownership
diferenciados. No se debe introducir una entidad nueva solo para imitar a otro
CRM.

## 7. Autorización: RBAC + scope + ABAC

La autorización objetivo se evalúa como una conjunción:

```text
usuario autenticado
AND membresía activa
AND rol permite la acción
AND recurso pertenece al scope autorizado
AND atributos del usuario y del recurso cumplen las reglas
AND transición respeta las reglas del flujo aprobadas
```

### Capas

| Capa | Función |
|---|---|
| **RBAC** | Permite acciones como administrar, supervisar, contactar, transferir o cerrar |
| **Scope** | Limita la acción al holding, empresas y equipos de la membresía |
| **ABAC** | Evalúa fuente elegible, propiedad actual, etapa, primer contacto y estado del traspaso |
| **Auditoría** | Registra actor, scope, causa, estado anterior y resultado de toda excepción |

El JWT debería identificar la sesión y al usuario. Los roles y scopes efectivos
deben revalidarse desde membresías activas, evitando que un claim antiguo
mantenga permisos después de una baja o cambio de empresa.

### Matriz TO-BE candidata

| Acción | Admin holding | Supervisor empresa | Asesor | Vendedor |
|---|:---:|:---:|:---:|:---:|
| Ver consolidado del holding | Sí | No | No | No |
| Ver todos los leads de una empresa autorizada | Sí | Sí | No | No |
| Ver cartera personal | Sí | Sí | Sí | Sí |
| Gestionar empresas y membresías | Sí | No | No | No |
| Gestionar bridges, fuentes y credenciales | Sí | No | No | No |
| Configurar elegibilidad y routing | Sí | Sí, dentro de su empresa | No | No |
| Asignar o reasignar asesor | Sí | Sí, dentro de su empresa | No | No |
| Registrar primer contacto y calificación | Excepción auditada | Excepción auditada | Solo lead propio | No |
| Traspasar a vendedor | Excepción auditada | Sí | Solo lead propio habilitado | No |
| Gestionar cita y seguimiento de cierre | Excepción auditada | Excepción auditada | No tras el traspaso | Solo lead propio |
| Confirmar venta | Excepción auditada | Excepción auditada | No | Solo lead propio |
| Confirmar no venta | Pendiente | Pendiente | Pendiente | Pendiente |
| Reasignar vendedor | Sí | Sí, dentro de su empresa | No | No |
| Ver configuración o secretos de otro tenant | No | No | No | No |

La etiqueta **excepción auditada** no implica aprobación. Señala que una
excepción administrativa, si se adopta, necesita motivo obligatorio y no debe
heredar automáticamente el permiso operativo del rol reemplazado.

## 8. Reglas candidatas asesor-vendedor

Estas reglas expresan el resultado operativo solicitado, pero no son contrato
aprobado. D5 condiciona la cardinalidad de roles, D7 la autoridad de cierre
negativo, D8 el momento efectivo del handoff y D9 las excepciones.

1. Un lead nuevo se asigna inicialmente a una membresía con capacidad de asesor.
2. El primer contacto debe persistirse como dato o evento explícito dentro de
   la misma transacción que su evidencia de seguimiento.
3. Un vendedor no puede quedar asignado mientras el primer contacto no esté
   confirmado y el lead no cumpla la condición de handoff acordada.
4. Un asesor no puede ejecutar la transición a `VENTA`.
5. Cuando el handoff se vuelve efectivo según D8, el vendedor pasa a ser
   responsable de la Oportunidad; el asesor conserva lectura para trazabilidad y
   pierde edición operativa.
6. Un vendedor no puede consultar leads u oportunidades sin traspaso, asignación
   o grant formal.
7. Asesor y vendedor deben tener membresía activa en la misma empresa del lead.
8. Una reasignación debe respetar la elegibilidad de fuente del destinatario.
9. Toda excepción de supervisor o administrador debe registrar actor, motivo,
   responsable anterior, responsable nuevo y empresa.
10. La empresa del lead no cambia mediante una reasignación de responsable.
11. Hasta resolver D7, `NO_VENTA` no tiene una competencia TO-BE establecida;
    no debe tratarse como permiso inherente de asesor, vendedor o supervisor.
12. Si D5 admite que una persona ejerza ambas capacidades, se modelará mediante
    membresías o capacidades con scope y una regla contra auto-traspasos. Si D5
    exige exclusividad, el modelo deberá impedir esa combinación.

## 9. Routing y elegibilidad por fuente

### Regla principal

La elegibilidad se persiste contra la **Fuente**. La interfaz puede permitir
seleccionar un bridge completo, pero debe expandir esa selección a sus fuentes o
representar explícitamente la herencia. Usar solo `RedSocial` sería demasiado
grueso para dos Páginas Meta con equipos diferentes.

### Secuencia candidata

1. Autenticar el bridge y resolver tenant, empresa y fuente según las
   asociaciones aprobadas en D1 y D12.
2. Resolver sitio, cuenta externa y campaña sin confiar en ownership enviado
   por el proveedor.
3. Persistir el payload validado, el sobre durable y la captación normalizada.
4. Ejecutar deduplicación dentro de la frontera acordada.
5. Buscar membresías activas con rol asesor dentro de la empresa.
6. Filtrar por elegibilidad de fuente, disponibilidad y reglas vigentes.
7. Aplicar precedencia de routing:
   - regla de campaña;
   - regla de fuente;
   - regla de sitio;
   - pool predeterminado de empresa.
8. Elegir menor carga activa y desempatar por FIFO dentro del pool resultante.
9. Persistir asignación, SLA, auditoría y notificación en una única transacción.
10. Si no hay candidato, dejar el lead sin asignar y notificar únicamente a
    supervisores de la empresa y a la administración autorizada según D1.

### Sitio con asesor propio

No se recomienda fijar `sitio.asesorId` como única solución. Una regla de
routing cuyo pool contiene un solo asesor expresa el caso actual y permite
evolucionar después a reemplazos, vacaciones o balanceo sin migrar el modelo.

La reasignación manual debe validar empresa, rol activo y elegibilidad. Un
override fuera de elegibilidad, si se aprueba, necesita motivo y auditoría.

## 10. Aislamiento de datos

### Controles obligatorios

- Claves directas de aislamiento en los agregados críticos según D1 y D11. Si Empresa es el tenant, no se exige además `holdingId`; si Holding es el tenant, el scope empresarial debe quedar materializado sin inferencias.
- Relaciones y constraints que impidan enlazar datos de empresas o tenants
  diferentes.
- Contexto de empresa obligatorio en servicios y repositorios.
- Scoping explícito en todas las consultas Prisma y SQL crudo.
- Notificaciones, logs, jobs y SSE resueltos dentro del tenant correspondiente.
- Claves de caché y queries del frontend con holding y empresa activa.
- Pruebas de aislamiento para listado, detalle, escritura, búsqueda,
  asignación masiva, métricas, eventos, notificaciones y bridges.
- Credenciales cifradas con el scope aprobado en D1/D12 y versión de clave.
- Auditoría de cambios de membresía, elegibilidad y reglas de routing.

### Defensa en profundidad

En un esquema compartido, PostgreSQL RLS es recomendable como segunda barrera,
no como sustituto del scoping de aplicación. Su adopción con Prisma exige
propagar el contexto por transacción y validar también las consultas
`$queryRaw`.

En una base por tenant, el aislamiento físico reduce el impacto de una omisión,
pero el control adicional depende de D1. Si Holding es el tenant, cada operación
también debe respetar el scope empresarial interno. Si Empresa es el tenant, ese
scope coincide con la frontera de aislamiento y el holding solo cruza empresas
mediante federación explícitamente autorizada.

### Contexto de API

Una evolución compatible puede introducir rutas empresariales explícitas en una
versión nueva, por ejemplo `/api/v2/empresas/:empresaId/leads`, mientras
`/api/v1` se asocia temporalmente a la empresa legacy. La selección visual de
empresa nunca debe ser el control de seguridad; el backend revalida membresía y
ownership en cada petición.

## 11. Deduplicación y atribución

### Alternativas de identidad

| Scope | Ventaja | Riesgo |
|---|---|---|
| Por empresa | Evita mezclar oportunidades y datos entre subsidiarias | Duplica a la misma persona dentro del holding |
| Por holding | Permite una vista de contacto consolidada | Puede exponer datos entre empresas y mezclar reglas de reingreso |
| Persona de holding + contacto comercial por empresa | Separa identidad común de relación comercial | Añade complejidad de privacidad, sincronización y permisos |

La opción segura para la primera migración es deduplicar por empresa mediante una
restricción equivalente a `UNIQUE (empresa_id, telefono_normalizado)`. La
alternativa de contacto compartido requiere aprobación explícita y reglas de
visibilidad independientes.

### Cambios necesarios

- Toda búsqueda por teléfono o correo debe incluir la frontera acordada.
- La búsqueda de lead abierto y último cierre debe incluir empresa.
- La ventana de reingreso se calcula dentro de la misma empresa.
- La idempotencia externa se conserva por bridge y lead externo.
- Una captación repetida no sobrescribe la atribución anterior.
- La fuente inicial, última fuente y campaña atribuida deben tener semánticas
  distintas y documentadas.
- El backfill de campaña no debe adivinar cuando un lead tiene varias
  recepciones incompatibles; esos casos deben quedar marcados para revisión.

## 12. Dashboard objetivo

### Visibilidad

| Actor | Vista predeterminada |
|---|---|
| Admin holding | Consolidado del holding con drill-down por empresa |
| Supervisor | Empresas de sus membresías, con foco en una empresa |
| Asesor | Captación, contacto, SLA y handoff de su cartera |
| Vendedor | Citas, pipeline de cierre, conversión e ingresos de su cartera |

### Dimensiones mínimas

- holding;
- empresa;
- sitio;
- canal;
- bridge;
- fuente;
- cuenta externa;
- campaña;
- asesor;
- vendedor;
- equipo;
- rango de fechas.

### Métricas que preservan la contribución de cada rol

- leads recibidos y captaciones;
- tiempo y tasa de primer contacto;
- SLA de asesor;
- tasa de calificación;
- tasa y tiempo de traspaso;
- leads aceptados por vendedor;
- citas agendadas, cumplidas y no asistidas;
- tasa de cierre por vendedor;
- conversión por empresa, sitio, fuente y campaña;
- monto vendido;
- tiempo total y por tramo del embudo;
- leads sin asignar por falta de elegibilidad.

El reporte por responsable no debe usar únicamente el responsable operativo
actual. Asesor y vendedor necesitan dimensiones separadas para no borrar la
contribución previa al handoff.

Volumen, conversión e ingresos pueden calcularse con datos CRM. CPL, ROAS,
impresiones, clics y gasto requieren importar métricas de las plataformas
publicitarias; no deben presentarse como disponibles a partir de leads solos.

## 13. Migración por fases

### Fase 0 — Contrato y reconciliación documental

- Decisiones D1 a D14 **ya resueltas** en `16-hallazgos-y-preguntas.md` §8.
- Mantener este documento como referencia de arquitectura hasta que el
  esquema y el código implementen lo resuelto.
- Separar estado actual, backlog y decisiones objetivo en la documentación.
- Preparar ADR o artefactos SDD para la frontera tenant ya elegida (D1).

### Fase 1 — Fundación aditiva

- Crear Holding, Empresa, Activo de captación, Sitio, Fuente, membresías y
  elegibilidades; la cardinalidad de roles o capacidades depende de D5.
- Crear los scopes legacy que correspondan a la frontera elegida en D1.
- Añadir como nullable las claves de ownership definidas por D1 y D11.
- Hacer backfill determinista del dataset existente.
- Añadir índices y constraints sin retirar columnas antiguas.

### Fase 2 — Membresías y autorización en sombra

- Crear membresías equivalentes a `Usuario.rol`, sin habilitar roles múltiples hasta resolver D5.
- Comparar decisiones del autorizador nuevo contra el comportamiento legacy.
- Incorporar empresa activa a perfil, navegación y query keys.
- Mantener `Usuario.rol` solo como compatibilidad temporal.

### Fase 3 — Procedencia y deduplicación

- Derivar empresa y fuente desde el bridge autenticado y sus asociaciones aprobadas en D12.
- Materializar cuenta externa, campaña y captación.
- Aplicar dedupe con scope empresarial o el scope finalmente aprobado.
- Dual-write de ownership y atribución.
- Reprocesar datos ambiguos mediante una cola de revisión, nunca con supuestos.

### Fase 4 — Aislamiento efectivo

- Cambiar lecturas y escrituras a contexto empresarial obligatorio.
- Scopear SQL crudo, jobs, notificaciones, SSE y logs.
- Ejecutar pruebas adversariales entre dos holdings y dos empresas del mismo
  holding.
- Activar RLS si la topología utiliza esquema compartido.

### Fase 5 — Routing y handoff

- Activar elegibilidad por fuente.
- Migrar `ultimaAsignacionEn` al scope de membresía o pool.
- Implementar precedencia de routing y fallback.
- Persistir primer contacto y estado de handoff.
- Aplicar la matriz asesor-vendedor acordada y el límite semántico
  Lead→Oportunidad definido en D13.

### Fase 6 — Dashboard jerárquico

- Incorporar selectores de holding, empresa, sitio y fuente según el rol.
- Separar métricas de asesor y vendedor.
- Reemplazar campaña JSON por relaciones materializadas.
- Scopear invalidaciones en tiempo real por tenant y empresa.

### Fase 7 — Endurecimiento y retiro legacy

- Convertir ownership requerido a `NOT NULL`.
- Retirar `Usuario.rol` y relaciones de responsabilidad no scopeadas.
- Retirar endpoints v1 o mantener una fecha de deprecación explícita.
- Validar backup, rollback, migración de producción y aislamiento.
- Actualizar el criterio de terminado y los documentos AS-IS.

## 14. Brechas M4/M5 y dependencias M6/M8 que condicionan el TO-BE

Esta sección es un **subconjunto orientado a la evolución multiempresa**. El
ledger completo y autoritativo de implementación continúa en
[`06-modulos-backend.md`](06-modulos-backend.md); una omisión aquí no significa
que la deuda haya sido cerrada.

### M4 — Ingesta, atribución y bridges

| Prioridad en `docs/06` | Brecha verificada | Impacto sobre el TO-BE |
|---|---|---|
| P1 · M4 | El endpoint genérico usa el adaptador de Google Forms y fija `GOOGLE_FORMS` aunque el bridge autenticado corresponda a otro canal | Bloquea reutilizar el flujo para X o sitio web conservando el canal real |
| P1 · M4/M5 | `LeadEntrante` transporta cuenta y campaña; `LeadRecibido.bridgeId -> LeadRecibido.leadId` conserva trazabilidad indirecta, pero el lead no tiene atribución singular y canónica de Fuente, Cuenta externa o Campaña | Permisos por fuente, routing y reportes dependen de JSON o de reconstruir varias recepciones potencialmente ambiguas |
| P1 · M4/M8 | `CuentaPublicitaria` ya persiste token cifrado y `tokenExpiraEn`, pero `TOKEN_POR_EXPIRAR` carece de productor y scheduler idempotentes | Falta la alerta preventiva prometida; en multiempresa también debe resolverse el destinatario dentro del scope correcto |
| P2 · M4 | LinkedIn y X continúan pendientes | La cobertura de captación es incompleta; deben implementarse después de estabilizar Fuente y atribución |
| P2 · M4/M8 | El ingreso sin teléfono ni correo crea una advertencia en `bridge_logs`, pero no una notificación a supervisores | Un log no sustituye el workflow operacional y sus destinatarios deben quedar scopeados |

Sitio web propio es una expansión TO-BE actualmente excluida del MVP, no una
casilla M4 ya comprometida. Debe incorporarse después de corregir el origen
canónico, sin forzarlo dentro de `RedSocial`.

### M5 — Gestión de leads y frontera con M6

| Prioridad en `docs/06` | Brecha verificada | Impacto sobre el TO-BE |
|---|---|---|
| P0 · M5/M6 | `canEdit` permite al responsable operativo cerrar desde etapas no terminales; mientras el asesor siga siendo responsable puede llegar a `VENTA` o `NO_VENTA` | No garantiza la separación de competencias; el cierre negativo continúa condicionado por D7 |
| P0 · M5/M6 | Administrador y supervisor pueden traspasar cualquier lead abierto que ya no esté en `NUEVO` a un vendedor aunque nunca haya tenido asesor asignado | Permite omitir por completo la intervención previa del asesor solicitada para el TO-BE |
| P0 · M5/M6 | Ningún camino de traspaso exige un evento o dato explícito que pruebe el primer contacto | Un vendedor puede recibir trabajo sin evidencia verificable de gestión previa, aunque el lead ya no esté en `NUEVO` |
| P0 · M5/M6 | `canTransfer` permite que el asesor original vuelva a cambiar al vendedor después del primer traspaso | El traspaso reiterado puede romper ownership, auditoría y SLA |
| P1 · M5 | El filtro `hasta` convierte `YYYY-MM-DD` a medianoche con `lte` y no valida `desde <= hasta` | Excluye casi todo el último día y acepta rangos invertidos, afectando listados y métricas por empresa |
| P2 · M5 | Falta `vista=activos|cerrados` en `GET /leads` | Backlog funcional conocido; no bloquea la fundación de aislamiento |
| P3 · M5 | `limite` acepta cualquier entero entre 1 y 100 en vez de la whitelist 10/25/50/100 | Desalineación de contrato; no bloquea tenancy |

No conviene completar LinkedIn, X o sitio web antes de corregir el contrato
genérico y la atribución canónica. Las deudas de listado pueden cerrarse en
paralelo, pero las brechas P0 de competencia deben resolverse antes de activar
el handoff multiempresa.

## 15. Riesgos y controles

| Riesgo | Control propuesto |
|---|---|
| Consulta sin scope expone datos | Contexto obligatorio, constraints, pruebas adversariales y RLS cuando aplique |
| Dedupe mezcla empresas | Clave compuesta por el scope aprobado |
| Admin o supervisor hereda acceso global | Roles ligados a membresías, nunca globales |
| Reasignación entrega un lead a usuario no elegible | Validación de empresa, rol y fuente en backend |
| Fuente informada por payload suplanta ownership | Empresa y fuente derivadas del bridge autenticado |
| Backfill atribuye campaña incorrecta | Cola explícita de registros ambiguos |
| Dashboard atribuye todo al vendedor final | Dimensiones separadas de asesor, vendedor y captación |
| Broadcast global genera ruido o inferencias | Invalidación por tenant y empresa |
| Credencial compartida cruza tenants | Asociaciones o grants explícitos según D12, cifrado y scope de auditoría |
| La migración rompe el MVP activo | Cambios aditivos, dual-read o dual-write, flags y rollback probado |
| Documentación vuelve a divergir | Un documento AS-IS verificable y artefactos TO-BE claramente etiquetados |

## 16. Cola ordenada de decisiones

> **Todas las decisiones D1–D14 de esta cola quedaron resueltas en
> [`16-hallazgos-y-preguntas.md`](16-hallazgos-y-preguntas.md) §8
> (2026-08-25).** Las descripciones debajo se conservan para explicar qué
> pregunta cubría cada ítem y por qué importaba — no describen un estado
> todavía abierto.

### D1 — Frontera tenant

> **¿El holding será el tenant principal con varias empresas internas, o cada
> empresa será un tenant independiente coordinado por una capa federada del
> holding?**

No se debe avanzar al diseño de esquema definitivo hasta responder D1.

### D2 — Frontera de identidad y deduplicación

Definición entre contacto por empresa, contacto por holding o identidad de
holding con perfil comercial separado por empresa.

### D3 — Cardinalidad de routing por sitio

Definición entre un asesor fijo por sitio, un pool elegible o una regla con
fallback empresarial.

### D4 — Granularidad de elegibilidad

Definición de permisos por fuente, bridge completo, cuenta externa o campaña, y
reglas de herencia entre esos niveles.

### D5 — Roles múltiples

Definición de una misma persona como asesor y vendedor, alcance por empresa y
política de auto-traspaso.

### D6 — Scope de supervisión

Definición de supervisor para una empresa, varias empresas seleccionadas o un
equipo dentro de una empresa.

### D7 — Competencia sobre `NO_VENTA`

Definición del rol habilitado para cerrar negativamente antes y después del
handoff.

### D8 — Modalidad del handoff

Definición entre asignación inmediata, aceptación del vendedor o solicitud con
rechazo y devolución.

### D9 — Política de excepciones

Definición de acciones que supervisor y administrador pueden ejecutar como
override, junto con motivo y auditoría obligatorios.

### D10 — Significado de rendimiento de canal

Definición entre rendimiento CRM de volumen y conversión, o rendimiento
publicitario con gasto, CPL, ROAS, impresiones y clics.

### D11 — Topología física de tenants

Definición entre base por holding, esquema compartido con RLS o control plane
con bases separadas.

### D12 — Integraciones compartidas

Definición del tratamiento de una credencial o cuenta externa que sirve a más
de una empresa.

### D13 — Límite Lead→Oportunidad

Decisión de dirección: el TO-BE separará semánticamente la prospección y
calificación del proceso de cierre. Permanece pendiente elegir la representación
física entre entidades Lead/Oportunidad separadas o un agregado con fases y
ownership diferenciados. El benchmark no decide esa persistencia por sí solo.

## 17. Criterio para pasar de borrador a propuesta implementable

- ✅ D1 tiene decisión explícita (`docs/16` §8).
- ✅ D2 a D14 completas están resueltas (`docs/16` §8): D2 identidad/dedup,
  D3 cardinalidad de routing, D4 elegibilidad, D5 roles múltiples, D6 scope
  de supervisión, D7 competencia sobre cierre, D8 modalidad de handoff, D9
  política de excepciones, D10 rendimiento de canal, D11 topología física,
  D12 integraciones compartidas, D13 límite Lead→Oportunidad (incluida su
  representación física) y D14 el efecto cascada de D13 sobre D2/D3/D7/D8/D9.
- [ ] La matriz de permisos de §7 queda formalmente aceptada como contrato,
  no solo como candidata.
- [ ] Existe una estrategia de backfill y rollback verificada.
- [ ] Se definen y ejecutan pruebas de aislamiento entre empresas.
- [ ] `AGENTS.md`, `openspec/project.md` y el alcance de producto dejan de
  describir el MVP como puramente single-company sin mencionar la evolución
  ya decidida.

Las decisiones ya no son el bloqueante: lo que falta es implementar el
esquema, el código y las pruebas que las materialicen. Hasta entonces, el MVP
vigente en código sigue siendo single-company.
