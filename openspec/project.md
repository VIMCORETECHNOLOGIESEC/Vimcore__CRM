# Contexto del proyecto — CRM Embudo de Leads

Documento de contexto que las fases SDD (`explore`, `propose`, `spec`, `design`,
`tasks`) cargan al inicio. Es un resumen operativo: el detalle vive en `docs/`.

---

## Propósito

Gestionar el ciclo de vida de leads captados por publicidad en redes sociales,
desde su ingreso automático hasta el cierre en venta o no venta, con asignación
a personal comercial, control de tiempos de atención y métricas de embudo.

## Contexto de despliegue

Instancia única por empresa. Sin multi-tenant. Sin personalización por cliente
en el MVP.

## Volumen esperado

- ~500 leads/mes (puede ser considerablemente menor)
- Hasta 100 usuarios concurrentes entre los cuatro roles

Estas cifras descartan la necesidad de particionado, sharding, colas distribuidas
o caché distribuida. **No sobre-dimensiones la arquitectura.** PostgreSQL con
índices correctos y un proceso Node único cubren este volumen con holgura.

## Actores

| Rol | Alcance de visión | Acciones distintivas |
|---|---|---|
| Administrador | Todo | Configura bridges y tokens, gestiona usuarios |
| Supervisor | Todo | Asigna y reasigna cualquier lead, recibe alertas de atraso |
| Asesor | Solo sus leads | Primer acercamiento, califica, traspasa al vendedor |
| Vendedor | Solo sus leads | Cierre de venta, gestiona la cita |

## Flujo principal

```
Red social (formulario de anuncio)
        ↓ webhook
Bridge de ingesta  →  normalización  →  deduplicación
        ↓
Persistencia (cliente + lead + campos dinámicos)
        ↓
Asignación automática por carga (o manual por supervisor)
        ↓
Notificación in-app al asesor  +  arranque del reloj SLA (24 h)
        ↓
Etapas: Nuevo → Contactado → Cita → Venta / No Venta
        (con formulario por etapa que recalcula el semáforo)
        ↓
Traspaso asesor → vendedor  (desde Contactado en adelante)
        ↓
Cierre + KPIs en el dashboard
```

## Decisiones arquitectónicas ya tomadas

Estas decisiones están cerradas. No las reabras durante `propose` o `design`
salvo que encuentres un impedimento técnico concreto, en cuyo caso repórtalo.

| Decisión | Elección | Razón |
|---|---|---|
| Tiempo real | SSE, no WebSocket | Flujo unidireccional; reconexión nativa; sin infraestructura extra para 100 concurrentes |
| ORM | Prisma | Code-first con la mejor inferencia de tipos en TypeScript; migraciones versionadas |
| Deduplicación | Por teléfono normalizado a E.164 | Un cliente = un teléfono; puede tener varios correos |
| Auditoría | Tabla `lead_eventos` desde el día uno | Los KPIs de tiempo son imposibles de calcular sin ella |
| Campos variables | Columna JSONB en `leads` | Cada campaña define campos distintos; no justifica tabla EAV |
| Autenticación | Usuario/contraseña propio, JWT | El SSO lo integra otro equipo después contra la misma API |

## Restricciones

- Interfaz exclusivamente en español
- Web responsive; sin app nativa
- Sin herramientas intermedias tipo Zapier/Make/n8n: integración directa con
  cada API oficial, porque el control de la interconectividad es parte del
  valor del producto que se vende
- Los tokens de red social los carga el administrador del cliente desde la
  interfaz, no el equipo de desarrollo

## Criterio de "terminado" para el MVP

El sistema está listo cuando una empresa puede: conectar sus cuentas
publicitarias, recibir leads automáticamente sin duplicados, verlos asignados a
su equipo, avanzarlos por el embudo con formularios que calculan la prioridad, y
leer en el dashboard de dónde vienen sus mejores oportunidades.
