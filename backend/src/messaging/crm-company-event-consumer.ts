import { DefaultAzureCredential } from "@azure/identity";
import { ServiceBusClient, type ServiceBusReceiver } from "@azure/service-bus";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { createCompanyEventHandler } from "./crm-company-event-handler.js";

export interface ServiceBusSettings {
  mode: "azure" | "local";
  connectionString?: string;
  fullyQualifiedNamespace?: string;
  topicName: string;
  subscriptionName: string;
}

type ServiceBusEnv = Pick<
  typeof env,
  | "SERVICE_BUS_MODE"
  | "SERVICE_BUS_CONNECTION_STRING"
  | "SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE"
  | "SERVICE_BUS_TOPIC_NAME"
  | "SERVICE_BUS_CRM_SUBSCRIPTION_NAME"
>;

/**
 * Settings the consumer needs for the configured mode, or `null` when they are
 * not present (local: connection string; azure: fully qualified namespace), in
 * which case provisioning is simply disabled and the CRM boots normally.
 */
export function resolveServiceBusSettings(source: ServiceBusEnv = env): ServiceBusSettings | null {
  const common = {
    topicName: source.SERVICE_BUS_TOPIC_NAME,
    subscriptionName: source.SERVICE_BUS_CRM_SUBSCRIPTION_NAME,
  };
  if (source.SERVICE_BUS_MODE === "local") {
    return source.SERVICE_BUS_CONNECTION_STRING
      ? { mode: "local", connectionString: source.SERVICE_BUS_CONNECTION_STRING, ...common }
      : null;
  }
  return source.SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE
    ? { mode: "azure", fullyQualifiedNamespace: source.SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE, ...common }
    : null;
}

type ReceiverFactory = Pick<ServiceBusClient, "createReceiver" | "close">;

/**
 * holding-admin-gateway-auth: consumes the CRM subscription of the shared
 * `vimcore-domain-events` topic and auto-provisions Holding + Empresa + admin
 * from the auth `CompanyModuleSubscribed` event (see `auth-provisioning.service`).
 * Same shape as Api_Auth's `BillingEventConsumer`: peekLock, no auto-complete
 * (every message is settled by the handler), `processError` only logs, and an
 * idempotent `close()`.
 */
export class CrmCompanyEventConsumer {
  private readonly receiver: ServiceBusReceiver;
  private closed = false;

  constructor(
    private readonly client: ReceiverFactory,
    topicName: string,
    subscriptionName: string,
  ) {
    this.receiver = client.createReceiver(topicName, subscriptionName, { receiveMode: "peekLock" });
  }

  start(): void {
    this.receiver.subscribe(
      {
        processMessage: createCompanyEventHandler(this.receiver),
        processError: async (args) => {
          logger.error(
            { entityPath: args.entityPath, errorSource: args.errorSource, message: args.error.message },
            "CRM company event processing error",
          );
        },
      },
      { autoCompleteMessages: false },
    );
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.receiver.close();
      await this.client.close();
    } catch (error) {
      logger.error(
        { message: error instanceof Error ? error.message : String(error) },
        "Failed to close the CRM company event consumer",
      );
    }
  }
}

/**
 * Starts the consumer next to the other background workers (`index.ts`, never
 * `app.ts`). Returns `null` -- and the CRM keeps running -- when Service Bus is
 * not configured or the client cannot be built.
 */
export function startCrmCompanyEventConsumer(
  settings: ServiceBusSettings | null = resolveServiceBusSettings(),
): CrmCompanyEventConsumer | null {
  if (settings === null) {
    logger.info("Service Bus is not configured: CRM auto-provisioning from auth events is disabled");
    return null;
  }

  try {
    const client =
      settings.mode === "local"
        ? new ServiceBusClient(settings.connectionString as string)
        : new ServiceBusClient(settings.fullyQualifiedNamespace as string, new DefaultAzureCredential());
    const consumer = new CrmCompanyEventConsumer(client, settings.topicName, settings.subscriptionName);
    consumer.start();
    logger.info(
      { mode: settings.mode, topicName: settings.topicName, subscriptionName: settings.subscriptionName },
      "CRM company event consumer started",
    );
    return consumer;
  } catch (error) {
    logger.error(
      { message: error instanceof Error ? error.message : String(error) },
      "Could not start the CRM company event consumer: auto-provisioning is disabled",
    );
    return null;
  }
}
