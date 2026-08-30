-- Bloque F (aditivo, decisión cerrada con el usuario): agrega dos roles
-- holding-wide nuevos al enum `rol_usuario` -- nunca se reemplaza ni se
-- retira ningún valor existente. Aditivo puro, sin downtime: PostgreSQL no
-- permite quitar valores de un enum, así que no hay `down` (mismo criterio
-- que 20260814110000_m6_asignacion_traspaso_sla y
-- 20260828152324_add_external_api_and_linkedin_bridges, ambas ADD VALUE sin
-- reversión).
--
-- Ambos comparten el MISMO alcance máximo: acceso total holding-wide, sin
-- restricción de `empresaId`, con capacidad de asignación manual. El retiro
-- del enum legacy (`ADMINISTRADOR`/`SUPERVISOR`/`ASESOR`/`VENDEDOR`) en los
-- 17-19 archivos que lo usan hoy NO es parte de este batch -- bloqueado por
-- coordinación con otro equipo.
ALTER TYPE "rol_usuario" ADD VALUE 'SUPERVISOR_HOLDING';
ALTER TYPE "rol_usuario" ADD VALUE 'SUPER_ADMIN';
