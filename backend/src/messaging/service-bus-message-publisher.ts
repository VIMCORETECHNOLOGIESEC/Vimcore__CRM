import { DefaultAzureCredential } from "@azure/identity";
import { ServiceBusClient, type ServiceBusMessage } from "@azure/service-bus";

export const CRM_EVENT_MODULE = "crm";

export interface PublishOptions {
  abortSignal?: AbortSignal;
}

export interface ServiceBusPublisherResources {
  sender: {
    sendMessages(message: ServiceBusMessage, options?: PublishOptions): Promise<void>;
    close(): Promise<void>;
  };
  client: { close(): Promise<void> };
}

export interface ServiceBusPublisherSettings {
  mode: "azure" | "local";
  connectionString?: string;
  fullyQualifiedNamespace?: string;
  topicName: string;
}

/** Port used by the outbox publisher loop. */
export interface MessagePublisher {
  publish(
    eventType: string,
    payload: string,
    correlationId: string,
    messageId: string,
    options?: PublishOptions,
  ): Promise<void>;
  close(): Promise<void>;
}

/**
 * crm-user-auth-provisioning (C1): sends CRM integration events to the shared
 * `vimcore-domain-events` topic. Mirrors Api_Auth's publisher so the Auth
 * consumers read the same envelope: raw UTF-8 JSON body, `messageId` = outbox
 * row id, and `{ eventType, module, correlationId }` as application properties.
 */
export class ServiceBusMessagePublisher implements MessagePublisher {
  private readonly resources: ServiceBusPublisherResources;
  private closePromise: Promise<void> | null = null;

  constructor(settings: ServiceBusPublisherSettings, resources?: ServiceBusPublisherResources) {
    if (resources) {
      this.resources = resources;
      return;
    }
    const client =
      settings.mode === "local"
        ? new ServiceBusClient(settings.connectionString as string)
        : new ServiceBusClient(settings.fullyQualifiedNamespace as string, new DefaultAzureCredential());
    this.resources = { client, sender: client.createSender(settings.topicName) };
  }

  async publish(
    eventType: string,
    payload: string,
    correlationId: string,
    messageId: string,
    options?: PublishOptions,
  ): Promise<void> {
    await this.resources.sender.sendMessages(
      {
        // Raw bytes (not a JS string) so the AMQP body is a data section that
        // cross-language consumers decode consistently.
        body: Buffer.from(payload, "utf-8"),
        contentType: "application/json",
        messageId,
        correlationId,
        applicationProperties: { eventType, module: CRM_EVENT_MODULE, correlationId },
      },
      options,
    );
  }

  /** Idempotent: closes the sender, then the client, once. */
  close(): Promise<void> {
    this.closePromise ??= (async () => {
      try {
        await this.resources.sender.close();
      } finally {
        await this.resources.client.close();
      }
    })();
    return this.closePromise;
  }
}
