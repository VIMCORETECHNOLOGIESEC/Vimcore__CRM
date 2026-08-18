-- F3/F4 (diseño D-A2, revisión 2): único cambio de esquema de esta unidad.
-- Aditivo — PostgreSQL no permite quitar valores de un enum, así que el
-- `down` deja el valor huérfano y sin filas (mismo plan de reversión que la
-- migración `20260814110000_m6_asignacion_traspaso_sla`, precedente
-- idéntico). PG 16 (docker-compose) admite ADD VALUE dentro del bloque de
-- transacción de Prisma porque el valor no se usa en esa misma transacción.
ALTER TYPE "tipo_evento_lead" ADD VALUE 'ASIGNACION_FALLIDA';
