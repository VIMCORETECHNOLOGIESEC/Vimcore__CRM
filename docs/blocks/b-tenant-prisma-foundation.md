# Bloque B — Fundación tenant y esquema Prisma

> Fase 3 de `docs/16-hallazgos-y-preguntas.md` §7 ("Fundación tenant
> aditiva"). Cubre Fase 1-3 de `docs/14-evolucion-multitenant.md` §13
> ("Fundación aditiva", "Membresías y autorización en sombra",
> "Procedencia y deduplicación").

## Alcance

Introducir `Empresa` y `Membresia` en el esquema, reemplazar el enum plano
`Usuario.rol` por membresías por empresa, y resolver el ruteo de login
multi-empresa. Backfill aditivo sobre el esquema existente — sin retirar
columnas legacy todavía (eso es Bloque F).

## Requiere cerrado

- **Bloque A** (endurecimiento single-company) — migrar sobre atribución
  todavía rota duplica trabajo.

## Decisiones que implementa (ver rationale completo en `docs/16` §8 — no se repite acá)

- **D1 — Frontera tenant**: Holding como tenant principal, empresas
  internas como scope funcional del lead.
- **D2 — Identidad y deduplicación**: Cliente compartido a nivel holding;
  Lead con scope por empresa; reingreso evaluado por (cliente, empresa).
- **D5 — Roles múltiples**: jerarquía de membresía (super admin / admin de
  holding / admin de empresa / supervisor / asesor con flag
  `habilitadoParaVenta`) reemplaza `enum RolUsuario`.
- **D11 — Topología física**: esquema compartido, una sola base de datos
  para todo el holding, sin `Holding` como tabla propia todavía.

## Esquema Prisma (movido desde `docs/16` §8.2)

```prisma
model Empresa {
  id       String   @id @default(uuid()) @db.Uuid
  nombre   String   @db.Text
  activa   Boolean  @default(true)
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
  empresaId           String?      @map("empresa_id") @db.Uuid // null = alcance holding-wide
  rol                 RolMembresia
  habilitadoParaVenta Boolean      @default(false) @map("habilitado_para_venta") // solo si rol = ASESOR
  activa              Boolean      @default(true) // soft toggle, nunca DELETE
  creadaEn            DateTime     @default(now()) @map("creada_en") @db.Timestamptz(6)

  usuario Usuario  @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  empresa Empresa? @relation(fields: [empresaId], references: [id], onDelete: Cascade)

  @@unique([usuarioId, empresaId, rol])
  @@index([empresaId, rol])
  @@map("membresias")
}
```

Cambios sobre modelos existentes: `Bridge.empresaId` (nuevo, NOT NULL);
`Lead.empresaId` (nuevo, habilita unicidad compuesta de "lead abierto" por
cliente+empresa); `Usuario.rol` y `enum RolUsuario` se retiran — toda
autorización pasa por `Membresia`. `empresaId: null` en vez de una fila por
empresa para admins de holding porque el pool de empresas crece de forma
incremental y no requiere backfill al crear una empresa nueva.

Ciclo de vida: quitar a alguien de una empresa es `Membresia.activa = false`,
nunca `DELETE`. `Usuario.activo` se recalcula automáticamente cuando pierde
su última membresía de empresa activa (excepto si conserva una membresía
holding-wide).

## Ruteo de login por membresía (movido desde `docs/16` §8.3)

- `Membresia.correo` (`String? @unique @db.Citext`) y
  `Membresia.passwordHash` (`String?`) — obligatorios cuando
  `empresaId != null`; credencial completamente independiente por empresa,
  nunca comparte contraseña con `Usuario` ni con otras empresas de la misma
  persona.
- Resolución en login: se busca primero en `Usuario.correo` (holding-wide);
  si no matchea, se busca en `Membresia.correo` con `activa = true` y se
  valida contra el `passwordHash` de esa fila. Mismo mensaje genérico de
  error en ambos casos fallidos (sin oráculo de cuentas).
- `RefreshToken` necesita `membresiaId` nullable (nulo si la sesión es
  holding-wide).
- La identidad de negocio sigue siendo `Usuario.id`; lo que se fragmenta por
  empresa es la credencial de acceso, no la identidad.
- **Riesgo de migración a resolver:** Postgres no garantiza unicidad entre
  `Usuario.correo` y `Membresia.correo` con un solo `UNIQUE` — requiere
  chequeo de aplicación en transacción antes de crear un correo nuevo.

## Backfill y migración (de `docs/14` §13, Fase 1-3)

**Fase 1 — Fundación aditiva:**
- Crear `Empresa`, `Membresia` y las claves de ownership como nullable.
- Backfill determinista del dataset existente (una `Empresa` para los datos
  actuales, membresías equivalentes al `rol` legacy de cada `Usuario`).
- Añadir índices y constraints sin retirar columnas antiguas.

**Fase 2 — Membresías y autorización en sombra:**
- Crear membresías equivalentes a `Usuario.rol` sin habilitar roles
  múltiples todavía.
- Comparar el autorizador nuevo (basado en `Membresia`) contra el
  comportamiento legacy antes de cortar el switch.
- Mantener `Usuario.rol` como compatibilidad temporal (se retira en
  Bloque F).

**Fase 3 — Procedencia y deduplicación:**
- Derivar `empresaId` desde el bridge autenticado.
- Aplicar dedup de "lead abierto" con scope (cliente, empresa).
- Dual-write de ownership y atribución durante la transición.
- Reprocesar datos ambiguos mediante cola de revisión, nunca con supuestos.

## Criterios de salida

- `Empresa` y `Membresia` existen en el esquema con backfill verificado.
- Login resuelve correctamente ambos tipos de credencial (holding-wide y
  por empresa).
- `Usuario.rol` sigue existiendo solo como compatibilidad temporal, no como
  fuente de autorización activa.

## Siguiente bloque

Bloque C (`docs/blocks/c-aislamiento.md`) — requiere `Membresia` ya
poblada para poder scopear consultas por empresa.
