import type { Request, Response } from "express";
import { getConfiguracion } from "../services/configuracion-empresa.service.js";

/**
 * PASO 5 (tema-empresarial-integracion): `GET /marca-publica` -- SIN
 * `requireAuthentication`, para el boot de la SPA (`AppBoot.tsx`) y la
 * pantalla de login (`LoginPage.tsx`), ninguno de los dos tiene sesión
 * todavía. Reusa `getConfiguracion()` (misma lectura lazy-init que
 * `GET /configuracion-empresa`) en vez de duplicar la query -- la forma que
 * devuelve esa función (`ConfiguracionEmpresaView`: nombre/colores/logo) ES
 * el subconjunto público autorizado, nada administrativo se agrega ni se
 * expone acá.
 *
 * Verificado y aceptado por el usuario (no hay modelo `Holding` todavía --
 * cada instancia desplegada es un solo holding): exponer esto sin auth no es
 * una fuga entre holdings distintos, es equivalente a cualquier sitio
 * mostrando su logo antes de loguearse. Mitigación: rate-limit básico
 * (`marca-publica-rate-limit.middleware.ts`), montado solo en esta ruta.
 */
export async function getMarcaPublica(_req: Request, res: Response): Promise<void> {
  const marca = await getConfiguracion();
  res.status(200).json(marca);
}
