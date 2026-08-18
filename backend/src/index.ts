import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { startCitasRecordatorioJob } from "./jobs/citas-recordatorio.job.js";
import { startIngestionWorker } from "./jobs/ingesta-inbox.job.js";
import { startSlaAtrasadoJob } from "./jobs/sla-atrasado.job.js";
import { prisma } from "./lib/prisma.js";
import { shutdownBackend } from "./server-lifecycle.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
});

// M6 (D2): el intervalo arranca aquí, nunca en app.ts, para que la suite de
// integración monte la app sin levantar timers vivos.
const slaTimer = startSlaAtrasadoJob();
// M7: mismo patrón que el job de SLA.
const citasTimer = startCitasRecordatorioJob();
const ingestionWorker = startIngestionWorker();

let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void shutdownBackend({
      stopTimers: () => { clearInterval(slaTimer); clearInterval(citasTimer); },
      closeHttp: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
      stopAndDrain: () => ingestionWorker.stopAndDrain(),
      disconnect: () => prisma.$disconnect(),
    });
  });
}
