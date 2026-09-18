// Fixture usada por `service-bus-env.test.ts`: imprime en un proceso hijo aislado
// los valores resueltos de las variables SERVICE_BUS_* de `config/env.ts`.
import { env } from "../../src/config/env.js";

console.log(
  JSON.stringify({
    mode: env.SERVICE_BUS_MODE,
    connectionString: env.SERVICE_BUS_CONNECTION_STRING ?? null,
    namespace: env.SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE ?? null,
    topic: env.SERVICE_BUS_TOPIC_NAME,
    subscription: env.SERVICE_BUS_CRM_SUBSCRIPTION_NAME,
  }),
);
