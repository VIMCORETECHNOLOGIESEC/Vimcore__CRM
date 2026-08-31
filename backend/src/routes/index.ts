import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { bridgesRouter } from "./bridges.routes.js";
import { canalManualRouter } from "./canal-manual.routes.js";
import { citasRouter } from "./citas.routes.js";
import { configuracionEmpresaRouter } from "./configuracion-empresa.routes.js";
import { empresaAparienciaRouter } from "./empresa-apariencia.routes.js";
import { eventsRouter } from "./eventos.routes.js";
import { formulariosRouter } from "./formularios.routes.js";
import { ingestaRouter } from "./ingesta.routes.js";
import { leadsRouter } from "./leads.routes.js";
import { linkedinRouter } from "./linkedin/linkedin.routes.js";
import { marcaPublicaRouter } from "./marca-publica.routes.js";
import { metaAdsRouter } from "./metaAds/meta-ads.routes.js";
import { metricasRouter } from "./metricas.routes.js";
import { negociacionRouter } from "./negociacion/negociacion.routes.js";
import { notificationsRouter } from "./notificaciones.routes.js";
import { reportesRouter } from "./reportes/reportes.routes.js";
import { healthRouter } from "./salud.routes.js";
import { usuariosRouter } from "./usuarios.routes.js";
import { whatsappRouter } from "./whatsappMessages/whatsapp.routes.js";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(usuariosRouter);
// Las rutas LinkedIn específicas se montan antes del router genérico de bridges.
apiRouter.use(linkedinRouter);
apiRouter.use(metaAdsRouter);
apiRouter.use(configuracionEmpresaRouter);
apiRouter.use(empresaAparienciaRouter);
apiRouter.use(marcaPublicaRouter);
apiRouter.use(bridgesRouter);
apiRouter.use(ingestaRouter);
apiRouter.use(leadsRouter);
// Bloque D (diseño, "Canal de ingreso manual y catálogo dinámico"): catálogo
// dinámico por empresa, consumido por el ingreso manual de leads de
// `leadsRouter` (arriba).
apiRouter.use(canalManualRouter);
apiRouter.use(formulariosRouter);
apiRouter.use(citasRouter);
apiRouter.use(metricasRouter);
apiRouter.use(notificationsRouter);
apiRouter.use(eventsRouter);
// whatsappMessages: mensajería WhatsApp Business Platform (Cloud API) —
// deliberadamente separada del router genérico de bridges (WhatsApp no
// extiende `Bridge`, ver el comentario del schema).
apiRouter.use(whatsappRouter);
// negociacion (Bloque D): split Lead/Oportunidad — 100% aditivo, ver el
// comentario de cabecera de oportunidad.repository.ts.
apiRouter.use(negociacionRouter);
// reportes (Bloque E, "Exportación PDF/XLSX"): 100% aditivo, reusa
// metricas.service.ts -- ver comentario de cabecera de reportes.service.ts.
apiRouter.use(reportesRouter);
