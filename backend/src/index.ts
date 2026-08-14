import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { startSlaAtrasadoJob } from "./jobs/sla-atrasado.job.js";

const app = createApp();

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
});

// M6 (D2): el intervalo arranca aquí, nunca en app.ts, para que la suite de
// integración monte la app sin levantar timers vivos.
startSlaAtrasadoJob();
