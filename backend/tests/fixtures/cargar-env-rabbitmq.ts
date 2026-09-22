// Fixture usada por `rabbitmq-env.test.ts`: imprime en un proceso hijo aislado
// los valores resueltos de las variables RABBITMQ_* de `config/env.ts`.
import { env } from "../../src/config/env.js";

console.log(
  JSON.stringify({
    url: env.RABBITMQ_URL ?? null,
    exchangeName: env.RABBITMQ_EXCHANGE_NAME,
    queueName: env.RABBITMQ_CRM_QUEUE_NAME,
  }),
);
