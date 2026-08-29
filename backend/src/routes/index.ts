import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { bridgesRouter } from "./bridges.routes.js";
import { citasRouter } from "./citas.routes.js";
import { configuracionEmpresaRouter } from "./configuracion-empresa.routes.js";
import { eventsRouter } from "./eventos.routes.js";
import { formulariosRouter } from "./formularios.routes.js";
import { ingestaRouter } from "./ingesta.routes.js";
import { leadsRouter } from "./leads.routes.js";
import { metricasRouter } from "./metricas.routes.js";
import { notificationsRouter } from "./notificaciones.routes.js";
import { healthRouter } from "./salud.routes.js";
import { usuariosRouter } from "./usuarios.routes.js";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(usuariosRouter);
apiRouter.use(configuracionEmpresaRouter);
apiRouter.use(bridgesRouter);
apiRouter.use(ingestaRouter);
apiRouter.use(leadsRouter);
apiRouter.use(formulariosRouter);
apiRouter.use(citasRouter);
apiRouter.use(metricasRouter);
apiRouter.use(notificationsRouter);
apiRouter.use(eventsRouter);
