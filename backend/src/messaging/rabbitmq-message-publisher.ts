import amqp, { type AmqpConnectionManager, type ChannelWrapper } from "amqp-connection-manager";
import type { ConfirmChannel } from "amqplib";

export const CRM_EVENT_MODULE = "crm";
export const DOMAIN_EVENTS_EXCHANGE_TYPE = "fanout";

export interface PublishOptions {
  abortSignal?: AbortSignal;
}

export interface RabbitMqPublisherResources {
  channelWrapper: {
    publish(exchange: string, routingKey: string, content: Buffer, options: Record<string, unknown>): Promise<boolean>;
    close(): Promise<void>;
  };
  connectionManager: { close(): Promise<void> };
}

export interface RabbitMqPublisherSettings {
  url: string;
  exchangeName: string;
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
 * crm-user-auth-provisioning (C1) / T4 (servicebus-to-rabbitmq-migration):
 * sends CRM integration events to the shared `vimcore-domain-events` durable
 * fanout exchange (asserted here on startup). Mirrors Api_Auth's publisher so
 * the Auth consumers read the same envelope: raw UTF-8 JSON body, `messageId`
 * = outbox row id, native AMQP `correlationId`, and `{ eventType, module }` as
 * headers -- eventType/module are not native AMQP properties, headers is the
 * AMQP equivalent of Service Bus's applicationProperties bag.
 */
export class RabbitMqMessagePublisher implements MessagePublisher {
  private readonly resources: RabbitMqPublisherResources;
  private readonly exchangeName: string;
  private closePromise: Promise<void> | null = null;

  constructor(settings: RabbitMqPublisherSettings, resources?: RabbitMqPublisherResources) {
    this.exchangeName = settings.exchangeName;
    if (resources) {
      this.resources = resources;
      return;
    }
    const connectionManager: AmqpConnectionManager = amqp.connect([settings.url]);
    const channelWrapper: ChannelWrapper = connectionManager.createChannel({
      setup: (channel: ConfirmChannel) =>
        channel.assertExchange(settings.exchangeName, DOMAIN_EVENTS_EXCHANGE_TYPE, { durable: true }),
    });
    this.resources = { channelWrapper, connectionManager };
  }

  async publish(
    eventType: string,
    payload: string,
    correlationId: string,
    messageId: string,
    options?: PublishOptions,
  ): Promise<void> {
    const publishPromise = this.resources.channelWrapper.publish(this.exchangeName, "", Buffer.from(payload, "utf-8"), {
      contentType: "application/json",
      // Equivalent of Service Bus's default durable delivery: survives a broker restart.
      persistent: true,
      messageId,
      correlationId,
      headers: { eventType, module: CRM_EVENT_MODULE },
    });

    if (!options?.abortSignal) {
      await publishPromise;
      return;
    }
    await raceWithAbort(publishPromise, options.abortSignal);
  }

  /** Idempotent: closes the channel, then the connection, once. */
  close(): Promise<void> {
    this.closePromise ??= (async () => {
      try {
        await this.resources.channelWrapper.close();
      } finally {
        await this.resources.connectionManager.close();
      }
    })();
    return this.closePromise;
  }
}

// amqplib/amqp-connection-manager have no built-in AbortSignal support, unlike the Service Bus SDK.
// The outbox publisher loop relies on the signal firing after the publish timeout to bound a stuck
// publish, so that behavior is reproduced here by racing the publish against the signal.
function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("Publish aborted"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("Publish aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
