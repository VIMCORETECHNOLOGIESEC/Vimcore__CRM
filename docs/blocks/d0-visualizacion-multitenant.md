# Bloque D0 — Visualización de la separación multiempresa

> **Decisión de calendario:** D0 es el único slice multi-tenant que se
> implementa antes del despliegue. Hace visible el aislamiento empresarial
> ya existente en Bloques B/C; no incorpora comportamiento de Bloque D.

## Ruta rápida de revisión

1. Confirmar la secuencia canónica `login → tokens → perfil → estado UI`.
2. Verificar que `empresaNombre` se resuelve en el servidor desde el
   `empresaId` canónico de la sesión.
3. Probar dos empresas del mismo tenant holding y observar que cada sesión
   identifica su scope y solo muestra sus propios datos.
4. Confirmar que no hay cambios Prisma, routing, autoridad ni dashboards.

## Estado (2026-08-28)

Aún no implementado. Este contrato reemplaza, para efectos de qué se ejecuta
antes del despliegue, la entrada directa a Bloque D completo.

## Objetivo

Hidratar en el frontend el scope tenant canónico que el backend ya expone y
mostrar un indicador persistente del alcance de la sesión. La demostración
debe usar dos empresas o scopes empresariales distintos dentro del **mismo
tenant holding**, no presentarlos como fronteras tenant separadas.

## No objetivos

- No scopear el pool de asignación por empresa (D3).
- No cambiar autoridad de cierre ni reemplazar `Usuario.rol` (D7/F).
- No crear `Oportunidad`, `Producto`, dashboards jerárquicos ni
  superadministración de holding.
- No agregar claims al token ni aceptar `empresaId` enviado por el cliente
  como fuente de autoridad.
- No modificar schema, migraciones ni archivos de alto riesgo enumerados en
  `docs/06-modulos-backend.md`.

## Contrato de autenticación e hidratación

### Decisión: `POST /auth/login` no se amplía

`POST /auth/login` conserva su contrato actual: devuelve tokens y
`PublicUser { id, nombre, correo, rol }`. D0 no duplica el scope tenant en esa
respuesta ni inventa claims nuevos. La fuente canónica para hidratar la sesión
es `GET /auth/perfil`, que ya devuelve el `AuthenticatedUser` resuelto por el
backend con `sessionScope`/`empresaId` y, para sesiones company,
`membresiaId`.

Secuencia obligatoria:

1. El usuario envía credenciales a `POST /auth/login`.
2. El cliente conserva los tokens mediante el mecanismo vigente.
3. Antes de montar contenido protegido o ejecutar queries de negocio,
   `AuthContext` solicita `GET /auth/perfil` con el token recibido.
4. El frontend construye su estado autenticado únicamente con la respuesta
   de perfil y muestra el indicador de scope.

Una recarga con tokens vigentes comienza directamente en el paso 3. Ni el
storage del navegador, ni parámetros de ruta, ni payloads del cliente pueden
sobrescribir `empresaId`, `membresiaId` o `sessionScope`.

### Extensión mínima de `GET /auth/perfil`

El backend agrega `empresaNombre` a la respuesta de perfil:

- Sesión `company`: usa el `empresaId` canónico ya resuelto server-side para
  leer `Empresa.nombre`; devuelve ese nombre junto con `empresaId` y
  `membresiaId`.
- Sesión `holding`: devuelve `empresaId = null`, `empresaNombre = null` y un
  scope de holding; `membresiaId` está ausente porque no existe una membresía
  holding-wide. La UI muestra un label estable como **“Alcance: Holding”** sin
  inventar ni elegir una empresa concreta.

Si una sesión `company` no puede resolver la `Empresa` asociada a su
`empresaId` canónico, el perfil falla de forma cerrada; no se degrada a un
nombre aportado por el cliente ni a un scope ambiguo.

## Contrato frontend

Tipos mínimos:

```ts
type SessionScope = "company" | "holding";

interface AuthenticatedUser extends PublicUser {
  sessionScope: SessionScope;
  empresaId: string | null;
  empresaNombre: string | null;
  membresiaId?: string;
}
```

Estados observables de `AuthContext`:

| Estado | Comportamiento requerido |
|---|---|
| Hidratando perfil | Mostrar estado de carga autenticada; no montar vistas ni queries de negocio. |
| Perfil company listo | Mostrar `Empresa: <empresaNombre>` y habilitar la aplicación protegida. |
| Perfil holding listo | Mostrar `Alcance: Holding`, sin empresa concreta. |
| Perfil responde 401 | Invalidar y purgar la sesión, incluidos tokens y scope hidratado, y volver a login. |
| Fallo transitorio de perfil | No reutilizar scope/empresa anterior ni montar queries de negocio; permitir reintentar el perfil. Conservar tokens solo si el fallo no indica que la autenticación es inválida. |
| Perfil incompleto o inconsistente | Tratarlo como fallo cerrado: no mostrar datos de negocio ni construir un scope ambiguo. |

El indicador debe permanecer visible en el shell autenticado (`Header` o
`Sidebar`) y no depender de que el usuario recuerde con qué credencial entró.
El frontend lo usa para orientación; la autorización sigue siendo exclusiva
del backend.

## Datos de demostración

El seed debe incluir:

- dos empresas A/B pertenecientes al mismo tenant holding;
- un usuario con membresía company-scoped para cada empresa;
- al menos un bridge y leads propios por empresa, con datos distinguibles.

No se modifica el schema. Los datos deben permitir iniciar sesión por separado
y reconocer visualmente tanto el nombre de empresa como la ausencia de datos
de la empresa hermana.

## Pruebas y criterios observables

### Contrato backend

- `POST /auth/login` conserva `PublicUser { id, nombre, correo, rol }`; no se
  agregan `empresaId`, `membresiaId`, `sessionScope` ni `empresaNombre`.
- `GET /auth/perfil` de una sesión company devuelve el scope canónico y
  `empresaNombre` leído desde `Empresa` mediante ese `empresaId`.
- `GET /auth/perfil` de una sesión holding devuelve `sessionScope = holding`
  y no atribuye una empresa concreta ni incluye `membresiaId`.
- Una empresa inexistente o inconsistente en una sesión company falla de
  forma cerrada.

### Contrato frontend

- La aplicación respeta `login → tokens → perfil → estado UI`; no ejecuta
  queries de negocio antes de completar el perfil.
- Los estados company, holding, carga y fallo son verificables en pruebas de
  `AuthContext` y del indicador visual.
- Un 401 de perfil purga la sesión y vuelve a login.
- Un error transitorio bloquea queries de negocio, no deja visible información
  ni scope anterior y permite reintentar el perfil sin purgar tokens válidos.

### Demostración de aislamiento visible

- El usuario de Empresa A ve `Empresa: A` y solo datos de A.
- El usuario de Empresa B ve `Empresa: B` y solo datos de B.
- Ambas empresas se describen como scopes empresariales distintos dentro del
  mismo tenant holding.
- La demostración prueba aislamiento de **lectura visible** ya garantizado por
  Bloque C; no afirma que routing o autoridad estén scopeados por empresa.

## Archivos permitidos y límites de riesgo

Cambios esperados y acotados:

- resolución server-side de `empresaNombre` en autenticación/perfil;
- tipos y estado de autenticación frontend;
- indicador visual en el shell autenticado;
- seed/fixtures y pruebas específicas de D0.

Permanecen sin cambios `backend/prisma/schema.prisma`, migraciones y todos los
archivos de alto riesgo de `docs/06-modulos-backend.md`, en particular
`asignacion.service.ts`, `leads.access.ts`, `jwt.ts`, middlewares de rol,
`event-broker.ts`, `httpClient.ts`, `router.tsx` y `layouts/navigation.ts`.
Si la implementación real exigiera tocar uno de ellos, D0 se detiene y el
alcance se vuelve a revisar; no se amplía silenciosamente.

## Dependencia satisfecha

- **Bloque C** está cerrado en `052e811` con 894/894 tests. D0 consume el
  aislamiento, TenantContext y RLS existentes; no los reemplaza.

## Siguiente bloque

Bloque D completo (`docs/blocks/d-routing-oportunidad.md`) se retoma después
del despliegue. Sus artefactos Engram #83-#86 siguen siendo la base y deben
ajustarse al calendario vigente antes de `apply`, no rehacerse desde cero.
