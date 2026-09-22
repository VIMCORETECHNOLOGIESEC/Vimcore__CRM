import amqp, { type AmqpConnectionManager, type ChannelWrapper } from "amqp-connection-manager";
import type { ConfirmChannel, ConsumeMessage } from "amqplib";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { createCompanyEventHandler } from "./crm-company-event-handler.js";
import { DOMAIN_EVENTS_EXCHANGE_TYPE } from "./rabbitmq-message-publisher.js";

export interface RabbitMqConsumerSettings {
  url: string;
  exchangeName: string;
  queueName: string;
}

type RabbitMqEnv = Pick<typeof env, "RABBITMQ_URL" | "RABBITMQ_EXCHANGE_NAME" | "RABBITMQ_CRM_QUEUE_NAME">;

/**
 * Settings the consumer needs, or `null` when `RABBITMQ_URL` is not present, in
 * which case provisioning is simply disabled and the CRM boots normally (same
 * optional-feature criterion Service Bus had).
 */
export function resolveRabbitMqSettings(source: RabbitMqEnv = env): RabbitMqConsumerSettings | null {
  if (!source.RABBITMQ_URL) return null;
  return {
    url: source.RABBITMQ_URL,
    exchangeName: source.RABBITMQ_EXCHANGE_NAME,
    queueName: source.RABBITMQ_CRM_QUEUE_NAME,
  };
}

/**
 * holding-admin-gateway-auth / T4 (servicebus-to-rabbitmq-migration): consumes
 * the CRM's durable queue bound to the shared `vimcore-domain-events` fanout
 * exchange (both asserted and bound here on startup) and auto-provisions
 * Holding + Empresa + admin from the auth `CompanyModuleSubscribed` event (see
 * `auth-provisioning.service`). Manual ack; every settlement decision still
 * flows through `crm-company-event-handler.ts`'s {complete, deadLetter,
 * abandon} contract -- deadLetter maps to a non-requeued reject (no
 * dead-letter exchange is configured, so the broker simply drops it: no new
 * dead-letter infrastructure is introduced), abandon maps to a requeued
 * reject, the equivalent of Service Bus's peek-lock abandon. An idempotent
 * `close()`, same as before.
 */
export class CrmCompanyEventConsumer {
  private readonly connectionManager: AmqpConnectionManager;
  private channelWrapper: ChannelWrapper | null = null;
  private closed = false;

  constructor(private readonly settings: RabbitMqConsumerSettings) {
    this.connectionManager = amqp.connect([settings.url]);
    this.connectionManager.on("connectFailed", ({ err }: { err: Error }) => {
      logger.error({ message: err.message }, "CRM company event consumer failed to connect to RabbitMQ");
    });
  }

  start(): void {
    this.channelWrapper = this.connectionManager.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(this.settings.exchangeName, DOMAIN_EVENTS_EXCHANGE_TYPE, { durable: true });
        await channel.assertQueue(this.settings.queueName, { durable: true });
        await channel.bindQueue(this.settings.queueName, this.settings.exchangeName, "");
        await channel.consume(this.settings.queueName, (message) => {
          if (message) void this.processMessage(channel, message);
        });
      },
    });
  }

  private async processMessage(channel: ConfirmChannel, message: ConsumeMessage): Promise<void> {
    const handle = createCompanyEventHandler({
      completeMessage: async () => {
        channel.ack(message);
      },
      deadLetterMessage: async () => {
        channel.nack(message, false, false);
      },
      abandonMessage: async () => {
        channel.nack(message, false, true);
      },
    });

    try {
      await handle({
        messageId: message.properties.messageId,
        correlationId: message.properties.correlationId,
        applicationProperties: message.properties.headers as Record<string, unknown> | undefined,
        // Always a raw Buffer over RabbitMQ (no SDK pre-decoding ambiguity like
        // Service Bus had) -- crm-company-event-handler.ts's decodeBody() JSON.parses it explicitly.
        body: message.content,
      });
    } catch (error) {
      logger.error(
        { message: error instanceof Error ? error.message : String(error) },
        "CRM company event processing error",
      );
      channel.nack(message, false, true);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.channelWrapper) await this.channelWrapper.close();
      await this.connectionManager.close();
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
 * `app.ts`). Returns `null` -- and the CRM keeps running -- when RabbitMQ is
 * not configured or the client cannot be built.
 */
export function startCrmCompanyEventConsumer(
  settings: RabbitMqConsumerSettings | null = resolveRabbitMqSettings(),
): CrmCompanyEventConsumer | null {
  if (settings === null) {
    logger.info("RabbitMQ is not configured: CRM auto-provisioning from auth events is disabled");
    return null;
  }

  try {
    const consumer = new CrmCompanyEventConsumer(settings);
    consumer.start();
    logger.info(
      { exchangeName: settings.exchangeName, queueName: settings.queueName },
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
