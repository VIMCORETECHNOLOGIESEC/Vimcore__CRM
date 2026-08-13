# 04 — Formularios por etapa y rúbrica del semáforo

Los formularios son **fijos y no personalizables** en el MVP. Viven en
`backend/src/config/formularios.ts`, aislados del resto del código para que su
futura migración a configuración por base de datos no toque la lógica del embudo.

---

## 1. Origen de la rúbrica

El cliente pidió que el formulario y la puntuación siguieran "las normas y formas
de uso estándar de embudos dentro de marketing digital", sin dictar reglas
específicas. La rúbrica se construyó sobre el marco **BANT** (Budget, Authority,
Need, Timeline), el criterio de calificación más extendido en equipos
comerciales, con dos ajustes hacia leads de origen publicitario:

- Se añade **contactabilidad** como factor, porque en leads de redes sociales el
  dato falso o el número inalcanzable son el modo de fallo más frecuente
- Se pondera el **plazo de decisión** por encima del presupuesto en las etapas
  tempranas, porque en el primer contacto el presupuesto rara vez es una
  respuesta confiable

> **Riesgo asumido (R5):** los umbrales no provienen de la operación real del
> cliente. Revísense tras las primeras dos semanas de uso con datos reales.

---

## 2. Escala del semáforo

Puntuación de 0 a 100 en cada formulario. El resultado sobrescribe
`lead.semaforo` y `lead.puntuacion`.

| Color | Rango | Lectura comercial |
|---|---|---|
| 🟢 Verde | 70 – 100 | Lead caliente. Prioridad de gestión |
| 🟡 Amarillo | 40 – 69 | Lead tibio. Requiere trabajo de enganche |
| 🔴 Rojo | 0 – 39 | Lead frío. Bajo esfuerzo, candidato a remarketing |

Constantes: `UMBRAL_VERDE = 70`, `UMBRAL_AMARILLO = 40`, en `config/negocio.ts`.

**Etapas terminales:** `VENTA` fija el semáforo en 🟢 y `NO_VENTA` en 🔴, sin
cálculo. Son resultados, no pronósticos.

### Fórmula

```
puntuacion = Σ (peso_pregunta × valor_opcion) / Σ (peso_pregunta × 10)  × 100
```

Cada opción vale de 0 a 10. El redondeo es al entero más cercano. La suma de
pesos por formulario está normalizada, de modo que agregar o quitar una pregunta
no descalibra el resultado.

---

## 3. Formulario — Etapa NUEVO

Lo completa el asesor tras su primer intento de acercamiento. Es el filtro de
entrada del embudo.

| # | Pregunta | Peso | Opciones (valor) |
|---|---|:--:|---|
| 1 | ¿Se logró contactar al lead? | 3 | Sí, respondió (10) · Sí, pero no pudo hablar (6) · No respondió, 1er intento (3) · Número inválido o inexistente (0) |
| 2 | ¿Reconoce haber llenado el formulario del anuncio? | 2 | Sí, con claridad (10) · Sí, vagamente (5) · No lo recuerda (2) · Niega haberlo llenado (0) |
| 3 | Nivel de interés declarado en el producto o servicio | 3 | Interés alto y concreto (10) · Interés general (6) · Solo curiosidad (3) · Ninguno (0) |
| 4 | Plazo en que evalúa decidir | 2 | Inmediato, menos de 1 semana (10) · Este mes (7) · Uno a tres meses (4) · Sin plazo definido (1) |
| 5 | ¿Es quien toma la decisión? | 1 | Sí (10) · Decide con alguien más (6) · No, consulta a un tercero (2) |

**Peso total: 11.** Puntuación máxima 100.

Nota de diseño: la pregunta 1 pesa lo mismo que el interés declarado. Un lead
inalcanzable no puede ser verde por muy interesante que parezca su formulario, y
esa es exactamente la distorsión que se busca evitar.

---

## 4. Formulario — Etapa CONTACTADO

Lo completa el asesor tras una conversación efectiva. Es la etapa donde se
decide si el lead merece pasar al vendedor.

| # | Pregunta | Peso | Opciones (valor) |
|---|---|:--:|---|
| 1 | Medio por el que se concretó el contacto | 1 | Llamada telefónica (10) · Videollamada (10) · Mensajería (6) · Correo (4) |
| 2 | Resultado de la conversación | 3 | Solicita avanzar o cotizar (10) · Pide información adicional (7) · Escuchó sin comprometerse (4) · Rechazó explícitamente (0) |
| 3 | Necesidad identificada respecto de la oferta | 3 | Encaja con precisión (10) · Encaja parcialmente (6) · Encaje dudoso (3) · No encaja (0) |
| 4 | Capacidad de pago o presupuesto | 2 | Confirmada y suficiente (10) · Estimada, probablemente suficiente (7) · Ajustada (4) · Insuficiente o se niega a hablarlo (1) |
| 5 | Objeción principal manifestada | 2 | Ninguna (10) · Precio (6) · Momento inoportuno (5) · Comparando competidores (5) · Desconfianza en la marca (3) · No la expresó (4) |
| 6 | Próxima acción acordada con el lead | 2 | Cita agendada (10) · Volver a contactar con fecha (7) · Volver a contactar sin fecha (3) · Ninguna (0) |

**Peso total: 13.**

Nota de diseño: la pregunta 6 tiene peso alto a propósito. Un compromiso
concreto del lead predice el cierre mejor que cualquier declaración de interés,
y es el indicador que los equipos comerciales suelen subestimar.

---

## 5. Formulario — Etapa CITA

Lo completa el vendedor tras la reunión.

| # | Pregunta | Peso | Opciones (valor) |
|---|---|:--:|---|
| 1 | ¿Asistió a la cita? | 3 | Sí, puntual (10) · Sí, reprogramada una vez (7) · Reprogramada dos o más veces (3) · No asistió sin aviso (0) |
| 2 | ¿Participó quien toma la decisión? | 2 | Sí (10) · Participó parcialmente (6) · No, solo un intermediario (2) |
| 3 | Presupuesto validado durante la reunión | 3 | Confirmado y suficiente (10) · Suficiente con ajustes (7) · Por debajo de lo requerido (3) · No se pudo validar (2) |
| 4 | Reacción a la propuesta presentada | 3 | Aceptación explícita (10) · Interés con condiciones (7) · Neutral, pide pensarlo (4) · Rechazo (0) |
| 5 | Próximo paso comprometido | 2 | Firma o pago acordado con fecha (10) · Segunda reunión agendada (7) · Espera respuesta sin fecha (3) · Ninguno (0) |
| 6 | Competidores en evaluación | 1 | Ninguno (10) · Uno (6) · Varios (3) · Ya tiene oferta de otro (1) |

**Peso total: 14.**

---

## 6. Formulario — Etapa VENTA

Registro de cierre. Sin puntuación: el semáforo queda 🟢 por definición.

| Campo | Tipo | Obligatorio |
|---|---|:--:|
| Fecha de cierre | fecha | ✅ |
| Monto de la venta | numérico (12,2) | ✅ |
| Producto o servicio vendido | texto | ✅ |
| Forma de pago | selección: Contado · Crédito · Financiamiento | ✅ |
| Observaciones | texto libre | ❌ |

---

## 7. Formulario — Etapa NO VENTA

Registro de cierre negativo. Sin puntuación: el semáforo queda 🔴 por definición.

| Campo | Tipo | Obligatorio |
|---|---|:--:|
| Fecha de cierre | fecha | ✅ |
| Observación del motivo | texto libre, mínimo 20 caracteres | ✅ |

> Se confirmó texto libre sin catálogo categorizado. El mínimo de 20 caracteres
> evita el "no quiso" que vuelve inservible el análisis posterior de pérdidas.
> Si más adelante se quisiera categorizar, la vía es analizar estas observaciones
> reales para construir el catálogo con evidencia en lugar de suponerlo.

---

## 8. Formularios diferenciados por color

El cliente describió acercamientos distintos según el semáforo. En el MVP esto
**no genera formularios adicionales**: se resuelve como orientación en la
interfaz, mostrando junto al formulario de la etapa una guía de acción según el
color vigente.

| Color | Guía mostrada al responsable |
|---|---|
| 🟢 Verde | Priorizar el cierre. Concretar el siguiente paso con fecha antes de terminar el contacto |
| 🟡 Amarillo | Trabajar la objeción principal registrada. El objetivo del contacto es recalificar, no cerrar |
| 🔴 Rojo | Un último intento de reenganche. Si no hay respuesta, cerrar como No Venta y dejarlo disponible para remarketing |

Crear tres juegos de formularios por color multiplicaría por tres la superficie de
mantenimiento sin cambiar los datos que se recogen. La diferencia real está en
cómo se conduce la conversación, y eso es guía, no estructura de datos.

---

## 9. Contrato técnico

```ts
export interface OpcionRespuesta {
  clave: string;
  etiqueta: string;
  valor: number;        // 0–10
}

export interface PreguntaFormulario {
  clave: string;
  etiqueta: string;
  peso: number;
  opciones: OpcionRespuesta[];
}

export interface FormularioEtapa {
  etapa: Etapa;
  version: string;      // se persiste en respuestas_formulario.version_rubrica
  calificable: boolean; // false en VENTA y NO_VENTA
  preguntas: PreguntaFormulario[];
}
```

El frontend consume la definición desde `GET /api/v1/formularios/:etapa` en lugar
de duplicarla. **El cálculo de la puntuación ocurre exclusivamente en el
backend**: el frontend puede mostrar una previsualización, pero el valor que se
persiste es siempre el que calcula el servidor sobre las respuestas recibidas.
