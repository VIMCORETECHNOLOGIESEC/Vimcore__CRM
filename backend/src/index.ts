import { env } from "./config/env.js";
import { createApp } from "./app.js";

const app = createApp();

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
});
