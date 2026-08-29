import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { bridgesRouter } from "./bridges.routes.js";
import { citasRouter } from "./citas.routes.js";
import { eventsRouter } from "./eventos.routes.js";
import { formulariosRouter } from "./formularios.routes.js";
import { ingestaRouter } from "./ingesta.routes.js";
import { leadsRouter } from "./leads.routes.js";
import { linkedinRouter } from "./linkedin/linkedin.routes.js";
import { metricasRouter } from "./metricas.routes.js";
import { notificationsRouter } from "./notificaciones.routes.js";
import { healthRouter } from "./salud.routes.js";
import { usuariosRouter } from "./usuarios.routes.js";
import { whatsappRouter } from "./whatsappMessages/whatsapp.routes.js";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(usuariosRouter);
// Las rutas LinkedIn específicas se montan antes del router genérico de bridges.
apiRouter.use(linkedinRouter);
apiRouter.use(bridgesRouter);
apiRouter.use(ingestaRouter);
apiRouter.use(leadsRouter);
apiRouter.use(formulariosRouter);
apiRouter.use(citasRouter);
apiRouter.use(metricasRouter);
apiRouter.use(notificationsRouter);
apiRouter.use(eventsRouter);
// whatsappMessages: mensajería WhatsApp Business Platform (Cloud API) —
// deliberadamente separada del router genérico de bridges (WhatsApp no
// extiende `Bridge`, ver el comentario del schema).
apiRouter.use(whatsappRouter);
