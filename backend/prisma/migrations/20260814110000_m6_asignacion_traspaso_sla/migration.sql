-- M6 (D6): único cambio de esquema del módulo. Aditivo — PostgreSQL no
-- permite quitar valores de un enum, así que el `down` deja el valor
-- huérfano y sin filas (inocuo, ver plan de reversión de la propuesta).
-- DD3: PG 16 (docker-compose) admite ADD VALUE dentro del bloque de
-- transacción de Prisma porque el valor NO se usa en esta misma transacción.
ALTER TYPE "tipo_evento_lead" ADD VALUE 'SIN_ASIGNAR';
