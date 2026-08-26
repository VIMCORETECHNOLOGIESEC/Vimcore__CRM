# 15 — Benchmark de CRM y hoja de ruta de evolución

Este documento define el **benchmark de mercado** y el estado objetivo (**TO-BE**)
para evolucionar el CRM desde una instancia aislada por empresa hacia un producto
capaz de atender holdings y varias empresas sin perder su diferenciador: el embudo
propio con traspaso asesor→vendedor, auditoría transaccional, SLA, semáforo y
asignación por menor carga con desempate FIFO.

> **Resultado ejecutivo:** competir no significa clonar HubSpot. La prioridad es
> convertir las reglas que ya distinguen al producto en invariantes de dominio y
> rodearlas de aislamiento multi-tenant, atribución y elegibilidad por fuente,
> permisos por alcance y reporting consolidado. La elegibilidad por fuente es una
> propuesta TO-BE; no describe el algoritmo vigente.

| Dato | Valor |
|---|---|
| Estado | **Benchmark / TO-BE** — no implementado |
| Corte de investigación | **2026-08-25** |
| Fuentes | Documentación oficial de cada proveedor |
| Autoridad actual del MVP | `docs/00-estado-documentacion.md`, `docs/01-alcance-mvp.md` y `docs/02-reglas-negocio.md`; para el AS-IS técnico, `backend/prisma/schema.prisma` y sus migraciones |
| Efecto sobre el código | Ninguno. Este documento no autoriza migraciones ni cambia contratos vigentes |

---

## 1. Lectura rápida

Para revisar esta propuesta sin reconstruir todo el contexto, verificar primero
estas cinco conclusiones:

1. **Tenant, holding, empresa, marca y organización prospecto no son sinónimos.**
2. **Contacto y organización identifican al cliente; varios CRM de mercado
   separan Lead y Oportunidad.** El código vigente todavía no adopta esa
   separación, pero la decisión ya está resuelta: D13/D14 en `docs/16` §8
   aprobaron separar `Lead` y `Oportunidad`.
3. **Permisos, visibilidad y elegibilidad para recibir leads son controles
   distintos.** Un rol no alcanza para expresar los tres.
4. **HubSpot Brands no es multi-tenancy.** Organiza activos dentro de una sola
   cuenta y no reemplaza el aislamiento de datos entre clientes del SaaS.
5. **El primer salto de producto debe consolidar el núcleo comercial.** Marketing
   completo, Service Desk, CPQ e IA predictiva son expansiones posteriores.

### Qué cambia y qué no

| Tema | Estado actual | Dirección TO-BE |
|---|---|---|
| Despliegue | Una instancia por empresa, sin `tenant_id` | Frontera resuelta (D1): holding como tenant, empresa como scope interno |
| Embudo | Un `Lead` recorre Nuevo→Contactado→Cita→Venta/No Venta | Mantener el embudo; separar `Oportunidad` como negociación distinta del contacto (D13/D14, ya decidido) |
| Roles | Un rol global por usuario | Membresías y capacidades por alcance: tenant, empresa, equipo y fuente según la frontera aprobada |
| Asignación | Pool global por rol, menor carga activa y desempate FIFO | Filtrar primero por empresa, fuente y elegibilidad; aplicar después disponibilidad/capacidad y conservar una regla determinística de carga |
| Atribución | Red, bridge, cuenta publicitaria y campaña parcialmente modelados | Trazabilidad inmutable desde fuente/campaña/formulario hasta cierre e ingreso |
| Reporting | KPIs generales y por responsable | Consolidado de holding y desglose por empresa, canal, activo de captación, asesor y vendedor |

> **Límite documental:** `AGENTS.md` y `docs/01-alcance-mvp.md` mantienen el
> despliegue single-tenant vigente; `docs/00-estado-documentacion.md` define la
> autoridad de cada documento y reserva Prisma más sus migraciones para el AS-IS
> técnico. Este TO-BE no debe corregir el alcance mediante frases sueltas. Cuando
> la frontera sea aprobada, se necesita un cambio de arquitectura y una
> actualización coordinada de alcance, reglas, modelo de datos, seguridad,
> bridges, módulos y KPIs.

---

## 2. Vocabulario de lectura del benchmark

El glosario está en
[`docs/14-evolucion-multitenant.md` §4](14-evolucion-multitenant.md#4-glosario-objetivo).
Las decisiones D1–D14 ya resueltas están en
[`docs/16-hallazgos-y-preguntas.md` §8](16-hallazgos-y-preguntas.md). Esta
sección solo resume las distinciones necesarias para leer el benchmark; no
crea una taxonomía paralela. Ante cualquier diferencia, prevalece `docs/16`
para el estado de las decisiones y `docs/14` para el glosario y la
arquitectura candidata.

| Concepto | Lectura usada en este benchmark | No confundir con |
|---|---|---|
| **Tenant** | Frontera de aislamiento, administración y ciclo de vida; resuelto (D1): corresponde al holding | La interfaz de trabajo o una empresa prospecto registrada en el CRM |
| **Workspace (interfaz)** | Contexto de navegación que muestra únicamente tenants, empresas y datos autorizados | Una frontera de seguridad o una jerarquía de dominio aprobada |
| **Holding / grupo empresarial** | Grupo que reúne empresas; resuelto (D1): es el tenant | Una frontera tenant sin confirmar |
| **Empresa operadora** | Unidad legal u operativa propietaria de leads y resultados; resuelto (D1): scope interno, no tenant | `Company`/Account de un prospecto B2B |
| **Marca** | Identidad comercial utilizada por una o varias empresas | Frontera de seguridad |
| **Activo de captación** | Término paraguas para los recursos que intervienen en la captación y atribución | Una unidad necesariamente enrutable |
| **Fuente** | Unidad concreta y enrutable dentro de un bridge, por ejemplo una Página Meta, un formulario, una cuenta LinkedIn o un sitio | El paraguas de activos o el canal genérico |
| **Bridge** | Conexión configurada que autentica, recibe o consulta datos de un proveedor y puede resolver varias fuentes | La fuente concreta que decide la elegibilidad de routing |
| **Contacto / cliente** | Persona identificada por datos normalizados | Una oportunidad comercial |
| **Organización prospecto** | Empresa externa con la que se mantiene una relación B2B | Empresa operadora del cliente del CRM |
| **Lead / Oportunidad** | HubSpot y otros CRM los separan; el código de este proyecto mantiene hoy un único `Lead`, pero la separación ya fue aprobada (D13/D14) | Un cambio todavía sin decidir |

La jerarquía sigue la frontera tenant ya resuelta en D1 (Alternativa A):

```text
Alternativa A                         Alternativa B
Tenant = Holding                     Holding federado
└── Empresa(s) operadora(s)          ├── Tenant = Empresa A
                                     └── Tenant = Empresa B

Workspace (interfaz)
└── Muestra solo los contextos autorizados por la alternativa aprobada
```

Marcas, equipos, Fuentes, Contactos y Leads se asocian al contexto autorizado,
pero no determinan por sí mismos la frontera tenant. La Oportunidad separada ya
quedó registrada como decisión canónica en `docs/16` §8 (D13/D14); falta
implementarla en esquema y código.

---

## 3. Benchmark principal: HubSpot

### 3.1 Contact, Company, Lead y Deal

HubSpot organiza el CRM mediante objetos, propiedades y asociaciones
bidireccionales. Contact y Company son objetos fundacionales; Lead representa la
calificación comercial, y Deal representa una transacción potencial.

| Objeto HubSpot | Finalidad | Lección aplicable |
|---|---|---|
| **Contact** | Persona que interactúa con la organización; se deduplica principalmente por correo | La identidad personal debe vivir fuera del ciclo de venta |
| **Company** | Organización prospecto o cliente; puede asociarse con contactos, deals y tickets | No utilizar `Company` como sustituto del tenant o de una empresa del holding |
| **Lead** | Proceso de prospección asociado obligatoriamente a un Contact o Company; una misma persona puede tener varios Leads | Un contacto puede reingresar o interesarse por líneas distintas sin duplicar su identidad |
| **Deal** | Oportunidad con ownership, importe, fecha de cierre y pipeline de ventas | El cierre requiere un proceso distinto de la captación y calificación |

Fuentes oficiales:

- [HubSpot — Understand objects](https://knowledge.hubspot.com/records/understand-objects), consultado el 2026-08-25.
- [HubSpot — Create companies](https://knowledge.hubspot.com/records/create-companies), consultado el 2026-08-25.
- [HubSpot — Create leads](https://knowledge.hubspot.com/records/create-leads), consultado el 2026-08-25; Leads requiere Sales Hub Professional o Enterprise.
- [HubSpot — Create deals](https://knowledge.hubspot.com/records/create-deals), consultado el 2026-08-25.

#### Brecha semántica del modelo actual

Actualmente `leads` representa todo el proceso desde la captación hasta
Venta/No Venta. El benchmark muestra que otros productos separan calificación y
cierre, pero esa observación no obliga a este CRM a adoptar sus objetos.

Si el producto evalúa una frontera Lead→Oportunidad, existen al menos estas
alternativas de diseño:

| Alternativa | Beneficio | Coste/riesgo |
|---|---|---|
| Separar entidades `lead` y `oportunidad` | Ownership, permisos, forecast y conversiones más claros; patrón reconocible de mercado | Migración amplia de modelo, eventos, endpoints, frontend y KPIs |
| Mantener un agregado con fases y ownership dual | Conserva el embudo y reduce la migración inmediata | Aumenta la complejidad de permisos, reporting y reaperturas comerciales |

**Gobernanza de la decisión — resuelta:** la alternativa de separar entidades
`lead` y `oportunidad` fue la elegida y quedó registrada en `docs/16` §8
(D13/D14), no por imitación del mercado sino porque el holding Arcano necesita
varias negociaciones paralelas por cliente. El agregado `Lead` único sigue
siendo el AS-IS en código hasta que se implemente la migración.

### 3.2 Pipelines y handoff

HubSpot mantiene pipelines distintos para Leads y Deals. Su pipeline de Leads
predeterminado es `New → Attempting → Connected → Qualified/Disqualified`; una
regla puede exigir crear un Deal al calificar el Lead. Las etapas de Deal agregan
probabilidad de cierre y alimentan forecast.

Fuentes:

- [HubSpot — Set up and manage object pipelines](https://knowledge.hubspot.com/object-settings/set-up-and-customize-pipelines), consultado el 2026-08-25.
- [HubSpot — Set up pipeline rules](https://knowledge.hubspot.com/object-settings/set-up-pipeline-rules), consultado el 2026-08-25.

El proyecto no debe reemplazar sus cinco etapas por las de HubSpot. Debe
preservar el contrato vigente de `docs/02-reglas-negocio.md`:

- Nuevo y Contactado pertenecen típicamente al asesor.
- El traspaso es explícito y no está permitido desde Nuevo.
- Cita y Venta pertenecen típicamente al vendedor después del traspaso; la
  competencia sobre No Venta ya está resuelta en `docs/16` §8 (D7).
- Cada cambio se registra en `lead_eventos` dentro de la misma transacción.

El TO-BE refuerza este comportamiento con las siguientes invariantes:

1. Un asesor no puede ejecutar la transición a Venta.
2. Un vendedor no puede recibir un Lead sin evidencia de primer contacto.
3. El handoff registra actor, origen, destino, momento, empresa, fuente y motivo.
4. El vendedor recibe la responsabilidad operativa por asignación inmediata,
   sin aceptación manual (D8, `docs/16` §8, ya resuelto).
5. El asesor conserva la visibilidad histórica necesaria para medir su aporte,
   pero no permiso de edición sobre la fase de cierre.
6. Supervisor y administrador pueden intervenir dentro de su alcance, siempre
   con evento de auditoría.

La competencia para cerrar `NO_VENTA`, antes y después del handoff, ya está
resuelta en `docs/16` §8 (D7) y falta reflejarse en permisos, transiciones y
auditoría del código.

### 3.3 Ownership, equipos y permisos

En HubSpot, el propietario del Lead puede ser independiente del propietario del
Contact o Company. El producto permite sincronizarlos, pero no lo impone.
[Sync lead ownership and activities](https://knowledge.hubspot.com/object-settings/sync-lead-ownership-and-activities), consultado el 2026-08-25.

HubSpot distingue permisos de visualización, edición, eliminación, fusión y
comunicación para objetos y actividades. Los alcances habituales son todos los
registros, registros del equipo y registros propios. El acceso por equipo y las
restricciones de propiedades o permission sets dependen de planes Professional
o Enterprise.

- [HubSpot — User permissions guide](https://knowledge.hubspot.com/user-management/hubspot-user-permissions-guide), consultado el 2026-08-25.
- [HubSpot — Assign access to records](https://knowledge.hubspot.com/records/assign-access-to-records), consultado el 2026-08-25.
- [HubSpot — Manage property access](https://knowledge.hubspot.com/properties/restrict-view-edit-access-for-properties), consultado el 2026-08-25; requiere Enterprise.
- [HubSpot — Manage user permissions](https://knowledge.hubspot.com/user-management/manage-user-permissions), consultado el 2026-08-25; permission sets requiere Enterprise.

Para este CRM, el modelo de autorización debe separar tres dimensiones:

| Dimensión | Pregunta que responde | Ejemplo |
|---|---|---|
| **Capacidad** | ¿Qué acción puede ejecutar? | Registrar Venta, reasignar, administrar Bridges |
| **Alcance de datos** | ¿Sobre qué registros puede ejecutarla? | Propios, equipo, empresa, tenant o federación autorizada |
| **Elegibilidad de routing** | ¿Qué trabajo puede recibir? | Leads de Meta de Empresa A, pero no de LinkedIn ni Empresa B |

#### Matriz mínima TO-BE

| Rol | Visibilidad | Intervención comercial | Administración |
|---|---|---|---|
| Administrador organizacional | Empresas autorizadas por el tenant o la federación | Supervisión excepcional | Usuarios, empresas, fuentes, bridges, políticas y reporting consolidado |
| Supervisor de empresa | Todos los Leads de su empresa/equipos | Asigna, reasigna, traspasa y corrige dentro del alcance | Disponibilidad, carga, reglas operativas y KPIs de su empresa |
| Asesor | Solo Leads propios y los compartidos explícitamente | Primer contacto, seguimiento y solicitud de handoff | No ejecuta Venta ni ve carteras ajenas; `NO_VENTA` resuelto en D7 |
| Vendedor | Trabajo propio posterior al handoff y registros compartidos explícitamente | Gestión desde el handoff hasta Venta; `NO_VENTA` resuelto en D7 | No recibe leads no contactados ni edita la fase de prospección |

Un usuario podría tener capacidades diferentes en empresas distintas. Por ello,
el futuro modelo no debe asumir que `usuario.rol` global describe toda su
participación.

> **Control de seguridad:** las restricciones deben aplicarse en backend y en
> cada consulta. Ocultar botones o filtrar listas en frontend no constituye
> aislamiento ni autorización.

### 3.4 Lead routing

Para registros CRM, HubSpot permite rotar ownership entre usuarios o miembros de
un equipo y, por defecto, distribuye los registros equitativamente. Las
modalidades adicionales —balance por carga, round-robin, selección aleatoria,
disponibilidad o capacidad— están documentadas para tickets y routing de Help
Desk; no deben extrapolarse como capacidad general de routing de Leads.

- [HubSpot — Assign and rotate record owners](https://knowledge.hubspot.com/workflows/assign-and-rotate-record-owners-using-workflows), consultado el 2026-08-25; requiere Sales Hub o Service Hub Professional/Enterprise.
- [HubSpot — Choose workflow actions](https://knowledge.hubspot.com/workflows/choose-your-workflow-actions), consultado el 2026-08-25.
- [HubSpot — Route tickets in help desk](https://knowledge.hubspot.com/help-desk/route-tickets-in-help-desk), consultado el 2026-08-25; requiere Service Hub Professional o Enterprise y asientos de Service para el routing automático.

Este CRM puede definir disponibilidad y capacidad como requisitos propios del
TO-BE, sin atribuirlos al routing comercial general de HubSpot. El diseño debe
mantener dos contratos y dos pools separados.

#### Contrato A — asignación inicial a asesor

```text
1. Tenant y empresa correctos
2. Fuente y bridge configurado habilitados
3. Membresías activas con capacidad de asesor en esa empresa
4. Elegibilidad efectiva para esa Fuente
5. Disponibilidad y capacidad no agotada
6. Menor carga activa y desempate determinístico
7. Fallback a cola supervisada de asignación inicial si no existe asesor elegible
```

Este flujo nunca incorpora vendedores como fallback.

#### Contrato B — routing post-contacto y handoff a vendedor

```text
1. Tenant, empresa, Fuente y bridge configurado coinciden con el Lead
2. Existe evidencia persistida del primer contacto
3. El handoff es válido y efectivo bajo la modalidad aprobada en D8
4. La competencia sobre NO_VENTA se evalúa según lo ya resuelto en D7
5. Membresías activas con capacidad de vendedor en esa empresa
6. Elegibilidad efectiva para esa Fuente
7. Disponibilidad y capacidad no agotada
8. Menor carga activa y desempate determinístico
9. Fallback a cola supervisada de handoff si no existe vendedor elegible
```

El fallback post-contacto no puede degradar a una asignación inicial, omitir la
evidencia de contacto ni entregar el Lead a un vendedor no elegible. La
responsabilidad mientras espera respeta la modalidad ya aprobada en D8.

Cada ejecución debe guardar el tipo de contrato, la versión de la política,
candidatos considerados, resultado y causa de fallback. Así el supervisor puede
explicar por qué un Lead fue asignado o quedó en una cola concreta, no solo
conocer el resultado.

### 3.5 HubSpot Brands frente a tenancy

HubSpot Brands permite administrar varias marcas en **una sola cuenta HubSpot**,
asociarles dominios, formularios, páginas, campañas, cuentas publicitarias y
cuentas sociales, y filtrar información por marca. Requiere Marketing Hub
Enterprise y Brands Add-on.

- [HubSpot — Manage Brands](https://knowledge.hubspot.com/branding/manage-your-brands-with-hubspot-brands), consultado el 2026-08-25.
- [HubSpot — Associate assets with Brands](https://knowledge.hubspot.com/branding/associate-assets-with-brands), consultado el 2026-08-25.
- [HubSpot — Manage social account settings](https://knowledge.hubspot.com/social/manage-your-social-account-settings), consultado el 2026-08-25.

| HubSpot Brands resuelve | HubSpot Brands no demuestra |
|---|---|
| Organización de activos por marca | Aislamiento fuerte entre clientes SaaS |
| Selección y filtrado contextual | Separación física o lógica garantizada de todos los registros |
| Reporting y contenido por marca | Autorización multi-tenant de extremo a extremo |
| Asociación de una cuenta social a una marca | Modelo de membresías entre holdings y empresas |

**Conclusión:** Brands es una referencia útil para activos y reporting dentro de
una organización. El aislamiento multi-tenant debe diseñarse aparte y abarcar
base de datos, repositorios, caché, SSE, jobs, archivos, logs, métricas,
credenciales y webhooks.

---

## 4. Qué incluye un CRM moderno

La plataforma de HubSpot conecta marketing, ventas y servicio sobre una base CRM
común. La amplitud sirve para ordenar el roadmap, no para declarar que todos sus
módulos pertenecen al siguiente MVP.

| Dominio | Capacidades observadas | Aplicación al producto |
|---|---|---|
| CRM base | Contactos, organizaciones, propiedades, asociaciones, actividades y deduplicación | Base de identidad, ownership e historial transversal |
| Marketing | Ads, formularios, landing pages, social, email, campañas, audiencias y atribución | Profundizar la captación y el rendimiento por fuente antes de publicar contenido |
| Ventas | Leads, Deals, tareas, secuencias, reuniones, llamadas, forecast y objetivos | Evolución natural del embudo y del trabajo diario de asesor/vendedor |
| Servicio | Tickets, help desk omnicanal, SLA, knowledge base, encuestas y customer success | Expansión posventa; no debe distraer del núcleo comercial inicial |
| Automatización | Workflows por evento, condiciones, ramas y acciones | Empezar con reglas acotadas, versionadas y auditables |
| Reporting y datos | Reportes multiobjeto, dashboards, scoring, calidad de datos y atribución | Consolidado del holding y drill-down hasta campaña/fuente/responsable |
| Revenue | Productos, line items, cotizaciones, firma, facturación, pagos y suscripciones | Fase posterior cuando el CRM deba gestionar ingresos, no solo registrar monto |
| Integraciones | OAuth, scopes, APIs, webhooks, marketplace y sincronización uni/bidireccional | Convertir bridges en una plataforma observable y segura de conectores |

Fuentes oficiales de referencia:

- [HubSpot — Marketing overview](https://knowledge.hubspot.com/get-started/market-your-business), consultado el 2026-08-25.
- [HubSpot — Sales overview](https://knowledge.hubspot.com/get-started/generate-sales), consultado el 2026-08-25.
- [HubSpot — Service overview](https://knowledge.hubspot.com/get-started/support-your-customers), consultado el 2026-08-25.
- [HubSpot — Create workflows](https://knowledge.hubspot.com/workflows/create-workflows), consultado el 2026-08-25; workflows completos requiere Professional/Enterprise.
- [HubSpot — Build lead scores](https://knowledge.hubspot.com/scoring/build-lead-scores), consultado el 2026-08-25.
- [HubSpot — Create custom reports](https://knowledge.hubspot.com/reports/create-custom-reports), consultado el 2026-08-25.
- [HubSpot — Campaign performance](https://knowledge.hubspot.com/campaigns/analyze-campaigns), consultado el 2026-08-25.
- [HubSpot — Attribution reports](https://knowledge.hubspot.com/reports/create-attribution-reports), consultado el 2026-08-25.
- [HubSpot — Developer Platform](https://developers.hubspot.com/docs/apps/developer-platform/overview), consultado el 2026-08-25.
- [HubSpot — Webhooks API](https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide), consultado el 2026-08-25.
- [HubSpot — Data Sync](https://knowledge.hubspot.com/integrations/connect-and-use-hubspot-data-sync), consultado el 2026-08-25.

---

## 5. Contraste breve con otros CRM

El objetivo del contraste es identificar patrones convergentes, no seleccionar
un producto para copiar.

| CRM | Patrón oficial relevante | Aprendizaje para este proyecto |
|---|---|---|
| **Salesforce** | Separa Lead, Account, Contact y Opportunity; al convertir un Lead crea relaciones entre esos objetos. Assignment Rules distribuye Leads a usuarios o colas, y Opportunity Teams agrega roles y acceso read-only/read-write | La calificación es una frontera explícita; ownership individual y colaboración sobre la oportunidad pueden coexistir |
| **Dynamics 365 Sales** | Business Units, roles y ownership controlan alcance; reglas asignan Leads/Opportunities por segmento, equipo y capacidad. Calificar un Lead crea o asocia Account, Contact y Opportunity; descalificar conserva auditoría | Es la referencia más cercana para holdings, supervisores con alcance transversal y seguridad por unidad |
| **Zoho CRM** | Territorios jerárquicos con manager, criterios, permisos, asignación automática/manual y forecast. Assignment Rules puede comprobar disponibilidad | Empresa/equipo/fuente pueden formar criterios de distribución sin convertir el rol en una lista rígida de canales |
| **Pipedrive** | Leads no calificados viven en Leads Inbox y se convierten en Deals. Separa Visibility Groups —qué se ve— de Permission Sets —qué se puede hacer— y ofrece asignación round-robin | Visibilidad y capacidades deben modelarse por separado; mantener Leads no calificados fuera del pipeline de cierre reduce ruido |

Fuentes oficiales:

- [Salesforce Trailhead — Standard objects in Sales Cloud](https://trailhead.salesforce.com/content/learn/modules/sales-cloud-configuration-basics/customize-sales-cloud), consultado el 2026-08-25.
- [Salesforce — Assignment Rules](https://help.salesforce.com/s/articleView?id=sf.creating_assignment_rules.htm&language=en_US&type=5), consultado el 2026-08-25.
- [Salesforce — Opportunity Teams](https://help.salesforce.com/s/articleView?id=sales.salesteam_add.htm&language=en_US&type=5), consultado el 2026-08-25.
- [Dynamics 365 — Business Units](https://learn.microsoft.com/en-us/power-platform/admin/create-edit-business-units), consultado el 2026-08-25.
- [Dynamics 365 — Assignment Rules](https://learn.microsoft.com/en-us/dynamics365/sales/wa-create-and-activate-assignment-rule), consultado el 2026-08-25.
- [Dynamics 365 — Qualify and convert a Lead](https://learn.microsoft.com/en-us/dynamics365/sales/qualify-lead-convert-opportunity-sales), consultado el 2026-08-25.
- [Zoho CRM — Using Territories](https://help.zoho.com/portal/en/kb/crm/security-control/territory-management/articles/use-territories), consultado el 2026-08-25.
- [Zoho CRM — Assignment Rules FAQ](https://help.zoho.com/portal/en/kb/crm/faqs/automation/assignment-rules/articles/faqs-assignment), consultado el 2026-08-25.
- [Pipedrive — Leads Inbox](https://support.pipedrive.com/en/article/leads-inbox), consultado el 2026-08-25.
- [Pipedrive — Visibility and permissions](https://support.pipedrive.com/en/article/visibility-and-permissions-overview), consultado el 2026-08-25.
- [Pipedrive — Automatic assignment](https://support.pipedrive.com/en/article/automatic-assignment), consultado el 2026-08-25.

---

## 6. Diferenciación competitiva

### Fortalezas verificadas del AS-IS que se deben conservar

- Embudo fijo de cinco etapas ajustado al proceso comercial del cliente.
- Handoff asesor→vendedor explícito, bloqueado desde `NUEVO` y auditado.
- SLA de 24 horas reiniciado por asignación, reasignación o traspaso.
- Semáforo calculado mediante formularios por etapa y una rúbrica en código.
- Registro transaccional de eventos como base de trazabilidad y parte de los KPIs.
- Asignación desde un pool global por rol, por menor carga activa y con desempate
  FIFO.
- Supervisión operativa con reasignación dentro de la instancia vigente.

### Propuestas TO-BE que amplían esas fortalezas

- Filtrar la asignación por tenant, empresa y elegibilidad de **Fuente** antes de
  aplicar carga y desempate; esto todavía no existe en el AS-IS.
- Resolver empresa y Fuente desde el Bridge configurado, sin confiar en el
  payload externo.
- Conservar atribución inmutable desde captación, Fuente, campaña y formulario
  hasta el resultado comercial.
- Versionar la política de routing y explicar candidatos, resultado y fallback.
- Acotar supervisión, auditoría y reporting por la frontera tenant aprobada.

### Qué no se debe perseguir todavía

- Paridad de módulos con HubSpot sin evidencia de demanda.
- Pipelines totalmente configurables antes de estabilizar las invariantes.
- Marketing email, publicación social o CMS como sustitutos del tracking de
  captación que todavía falta completar.
- IA predictiva sin volumen histórico, calidad de datos ni métricas confiables.
- Permisos configurables que solo existan en frontend.
- Un “panel de holding” construido antes de garantizar aislamiento tenant por
  tenant.

---

## 7. Roadmap priorizado

La prioridad representa dependencia de producto y arquitectura, no estimación de
esfuerzo ni autorización de implementación.

### MUST — fundamento del producto multi-tenant

- [ ] Mantener `docs/14-evolucion-multitenant.md` como glosario y arquitectura
      candidata, y `docs/16-hallazgos-y-preguntas.md` §8 como registro de las
      decisiones D1-D14 ya resueltas; usar Activo de captación como paraguas,
      Fuente como unidad enrutable, Bridge como conexión configurada y
      workspace solo para la interfaz.
- [x] Definir la frontera real del tenant y el alcance del administrador del
      holding — resuelto en D1, `docs/16` §8.
- [ ] Diseñar aislamiento obligatorio de datos y credenciales en toda consulta,
      job, evento SSE, webhook, log y métrica.
- [ ] Sustituir el rol global como única fuente de autorización por membresías y
      capacidades con alcance.
- [ ] Formalizar el contrato de handoff, incluido qué constituye “primer
      contacto” y si el vendedor debe aceptar la transferencia.
- [ ] Impedir en backend que el asesor cierre una venta y que el vendedor reciba
      trabajo sin cumplir la precondición de contacto.
- [ ] Incorporar elegibilidad dinámica por empresa y Fuente; el Bridge aporta el
      contexto de conexión, pero no sustituye la unidad de routing.
- [ ] Añadir disponibilidad, capacidad, fallback y explicación auditable al
      algoritmo de asignación.
- [ ] Mantener toda reasignación y cambio de ownership dentro de una transacción
      con su evento de auditoría.
- [ ] Definir deduplicación y reingreso por tenant/empresa, incluida la política
      para una misma persona que interactúa con varias empresas del holding.
- [ ] Garantizar atribución inmutable por empresa, captación, Fuente, Bridge,
      sitio/cuenta, campaña, formulario y responsable.
- [ ] Entregar reporting consolidado del holding con desglose por empresa,
      fuente, asesor y vendedor.
- [ ] Actualizar de forma coordinada `AGENTS.md` y `docs/01` a `docs/08` cuando
      estas decisiones sean aprobadas.

### SHOULD — operación comercial competitiva

- [ ] Modelar campañas, cuentas externas, páginas sociales, sitios y formularios
      bajo el paraguas de activos de captación, con relaciones explícitas hacia
      Bridge y Fuente sin convertir el paraguas en clave de routing.
- [ ] Incorporar equipos jerárquicos y permission sets reutilizables.
- [ ] Permitir administrar reglas de routing con prioridad, versión, simulación e
      historial de ejecución.
- [ ] Separar señales de **fit** y **engagement** sin eliminar el semáforo propio.
- [ ] Crear una interfaz de trabajo del asesor con tareas, cola de seguimiento y
      siguiente acción esperada.
- [ ] Añadir objetivos y forecast por empresa, equipo y vendedor.
- [ ] Crear reportes guardados y dashboards filtrables sin exponer datos fuera
      del alcance del usuario.
- [ ] Exponer el timeline interno de actividades y eventos con permisos.
- [ ] Añadir detección y fusión segura de duplicados.
- [ ] Convertir bridges en una plataforma de integración con OAuth/scopes cuando
      aplique, health checks, reintentos, replay e idempotencia observable.
- [ ] Incorporar automatizaciones acotadas, versionadas y auditables sobre
      eventos del dominio.

### LATER — expansión de plataforma

- [ ] Campañas de marketing, publicación social, email, audiencias y landing
      pages administradas desde el CRM.
- [ ] Service Desk con tickets, bandeja omnicanal, base de conocimiento y
      métricas CSAT/NPS/CES.
- [ ] Catálogo, productos, cotizaciones, firma, facturación, pagos y
      suscripciones.
- [ ] Customer Success y health score posventa.
- [ ] Scoring y forecast predictivos una vez que exista volumen histórico
      suficiente y calidad de datos demostrada.
- [ ] Objetos, formularios, scoring y pipelines completamente configurables.
- [ ] Marketplace público y sincronización bidireccional con terceros.
- [ ] Aplicación móvil nativa si aparece una necesidad operativa verificable.

---

## 8. Decisiones que bloqueaban el diseño — todas resueltas

Las 14 decisiones de esta tabla ya están resueltas en
[`docs/16-hallazgos-y-preguntas.md` §8](16-hallazgos-y-preguntas.md). La
siguiente tabla es solo un índice declarativo; `docs/16` conserva el texto y
el estado canónico de cada resolución, y `docs/14` conserva el detalle de
arquitectura candidata que las sustenta.

| Tema | Decisión requerida | Por qué bloquea |
|---|---|---|
| D1 — Frontera tenant | Elegir holding como tenant o empresa como tenant coordinada mediante federación | Define la clave de aislamiento y la jerarquía administrativa |
| D2 — Identidad y deduplicación | Elegir contacto por empresa, por holding o identidad de holding con perfil comercial por empresa | Cambia privacidad, reingreso, unicidad y reporting |
| D3 — Routing por sitio | Elegir asesor fijo, pool elegible o regla con fallback empresarial | Define cardinalidades y comportamiento cuando ingresa una captación web |
| D4 — Granularidad de elegibilidad | Definir permisos por Fuente o selecciones de Bridge, cuenta externa o campaña que hereden o se expandan a Fuentes | Mantiene Fuente como unidad efectiva de routing sin perder administración por niveles superiores |
| D5 — Roles múltiples | Definir rol dual asesor/vendedor, su alcance y la política de auto-traspaso | Cambia membresías, autorización y conflictos de interés |
| D6 — Scope de supervisión | Definir supervisión por empresa, conjunto de empresas o equipo | Determina visibilidad, reasignación y reporting operativo |
| D7 — Competencia sobre `NO_VENTA` | Definir el rol habilitado antes y después del handoff | Bloquea permisos y transiciones de cierre negativo; este benchmark no lo fija |
| D8 — Modalidad del handoff | Elegir asignación inmediata, aceptación o solicitud con rechazo/devolución | Define ownership, SLA, notificaciones y fallback |
| D9 — Excepciones | Definir overrides de supervisor/administrador y su motivo auditable | Evita bypass silencioso de las invariantes comerciales |
| D10 — Rendimiento de canal | Elegir rendimiento CRM —volumen y conversión— o rendimiento publicitario —gasto, CPL, ROAS, impresiones y clics— | Condiciona datos de origen, KPIs y lectura consolidada |
| D11 — Topología física | Elegir base por holding, esquema compartido con RLS o control plane con bases separadas | Define migración, aislamiento, operación y recuperación |
| D12 — Integraciones compartidas | Definir el tratamiento de una credencial o cuenta externa usada por varias empresas | Evita cruces de ownership y secretos entre empresas o tenants |
| D13 — Límite Lead→Oportunidad | Elegir la representación física entre entidades separadas o un agregado con fases y ownership diferenciados | Define modelo de datos, API, eventos, permisos y KPIs sin imponer una entidad por imitación del mercado |

---

## 9. Criterio de avance

- [x] Se cumple el criterio canónico de `docs/14-evolucion-multitenant.md` §17
      para las decisiones: D1 tiene respuesta explícita y D2–D14 están
      registradas en `docs/16` §8, no solamente en este índice.
- [ ] Exista una matriz de capacidades, alcance y routing aprobada por rol
      **como contrato**, no solo como candidata.
- [ ] Se haya acordado la política de deduplicación entre empresas.
- [ ] Se haya definido la primera rebanada multi-tenant sin mezclar módulos
      `LATER`.
- [ ] La documentación vigente se actualice como un conjunto coherente y no como
      correcciones aisladas.

Hasta entonces, este archivo es una guía de producto y benchmark, no una
especificación lista para `apply`.
