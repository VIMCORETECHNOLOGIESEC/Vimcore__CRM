# 08 — Dashboard y definición de KPIs

Cada KPI incluye su cálculo exacto. Un indicador sin definición precisa produce
discusiones sobre si el número está bien, en lugar de decisiones comerciales.

Todos se calculan sobre `lead_eventos`, y por eso esa tabla es obligatoria desde
el primer día aunque no se muestre en la interfaz.

---

## 1. Alcance por rol

| Rol | Alcance de los datos |
|---|---|
| Administrador | Todos los leads |
| Supervisor | Todos los leads |
| Asesor | Solo leads donde es `asesor_id` |
| Vendedor | Solo leads donde es `vendedor_id` |

El alcance se aplica **en el backend**. Un asesor que llame directamente al
endpoint de métricas debe recibir solo su cartera.

---

## 2. Indicadores de resumen

### 2.1 Total de leads ingresados

Conteo de `leads` con `ingresado_en` dentro del rango. Incluye los de reingreso,
que son oportunidades nuevas.

### 2.2 Leads en gestión

Conteo de leads con etapa distinta de `VENTA` y `NO_VENTA`.

### 2.3 Leads cerrados

Conteo con `cerrado_en` dentro del rango, desglosado en Venta y No Venta.

> Ojo con el criterio de fecha: los cerrados se cuentan por **fecha de cierre**,
> los ingresados por **fecha de ingreso**. Un lead que ingresó en mayo y cerró en
> junio aparece en el ingreso de mayo y en el cierre de junio. Es correcto, pero
> hay que rotularlo en la interfaz para que nadie intente cuadrar ambas cifras.

### 2.4 Tasa de conversión

```
tasa = leads en etapa VENTA / (leads en VENTA + leads en NO_VENTA) × 100
```

Se calcula sobre leads **cerrados**, no sobre el total ingresado. Incluir los
leads aún en gestión deprime artificialmente la tasa y la vuelve inservible para
comparar períodos.

Muestra siempre el denominador junto al porcentaje: "32 % (16 de 50)". Un 100 %
sobre dos leads no significa lo mismo que un 100 % sobre doscientos.

### 2.5 Tiempo promedio de primera respuesta

Desde el evento `ASIGNACION` hasta el primer `CAMBIO_ETAPA` que saque al lead de
la etapa Nuevo.

```sql
AVG(primer_cambio_etapa.ocurrido_en - asignacion.ocurrido_en)
```

Solo sobre leads que efectivamente avanzaron. Los que nunca salieron de Nuevo no
tienen tiempo de respuesta; se reportan aparte como "leads sin primera
respuesta".

Presentación en horas con un decimal.

### 2.6 Tiempo promedio de cierre

Desde `ingresado_en` hasta `cerrado_en`, solo sobre leads con etapa `VENTA`.

Los cierres en No Venta se reportan por separado: mezclarlos distorsiona el
indicador, porque un abandono rápido y una venta rápida tienen significados
opuestos.

Presentación en días con un decimal.

### 2.7 Cumplimiento de SLA

```
cumplimiento = leads atendidos dentro de 24 h / leads asignados × 100
```

"Atendido" = existe un `CAMBIO_ETAPA` fuera de Nuevo dentro de las 24 h
posteriores a la asignación.

---

## 3. Gráficas

### 3.1 Leads por red social

Barras verticales. Conteo agrupado por `red_social`.
Métrica secundaria: tasa de conversión de cada red.

### 3.2 Leads por asesor

Barras horizontales ordenadas de mayor a menor. Agrupado por responsable.
Métricas secundarias por asesor: tasa de conversión y cumplimiento de SLA.

Visible solo para administrador y supervisor.

### 3.3 Embudo por etapa

Gráfica de embudo con el conteo en cada etapa y el porcentaje de caída entre
etapas consecutivas.

Orden: Nuevo → Contactado → Cita → Venta. **No Venta se muestra aparte**, no
como paso del embudo: es una salida, no una etapa de avance.

### 3.4 Leads por campaña

Barras horizontales, las 10 campañas con más leads. Etiqueta con nombre de
campaña y red social, porque una misma campaña puede existir con el mismo nombre
en redes distintas y son registros independientes.

### 3.5 Red social × semáforo

Barras apiladas: eje X por red social, segmentos por color del semáforo.

Es la gráfica que el cliente describió como clave para su estrategia: responde
de qué red social llegan los leads con mayor probabilidad de cierre, no solo de
cuál llegan más leads. Una red puede aportar el mayor volumen y la peor calidad,
y esta vista lo hace visible de inmediato.

Métrica acompañante: porcentaje de leads verdes sobre el total de cada red.

### 3.6 Distribución por semáforo

Gráfica de anillo con el conteo por color sobre los leads en gestión. Excluye
los cerrados, cuyo color es fijo por definición y contaminaría la lectura.

---

## 4. Filtros

| Filtro | Valores |
|---|---|
| Rango de fechas | Hoy · 7 días · 30 días · Mes actual · Mes anterior · Personalizado |
| Comparativa | Contra el período inmediatamente anterior de igual duración |
| Red social | Todas o una específica |
| Campaña | Todas o una específica |
| Responsable | Solo administrador y supervisor |

La comparativa muestra la variación porcentual con indicador de dirección. Cuando
el período anterior tiene menos de 10 leads, se omite el porcentaje y se muestran
los valores absolutos: una variación porcentual sobre 3 leads es ruido presentado
como señal.

---

## 5. Actualización en tiempo real

- Los indicadores se recalculan y reemiten por SSE ante: ingreso de lead, cambio
  de etapa, cierre y asignación
- Cada cliente recibe únicamente los indicadores de su alcance por rol
- Ante interrupción del canal SSE, el frontend muestra un indicador de
  reconexión y recarga los datos al restablecerse

**Nota de rendimiento:** agrupa las reemisiones en ventanas de 2 segundos. Con
un ingreso masivo de leads, emitir un recálculo por cada uno satura el canal sin
aportar información que el ojo humano pueda seguir.

---

## 6. Punto de extensión: exportación

Fuera del alcance del MVP, pero previsto: todos los servicios de métricas
devuelven estructuras serializables independientes del formato de presentación.
Agregar exportación a Excel o PDF consistiría en añadir una capa de formato sobre
los mismos servicios, sin tocar la lógica de agregación.
