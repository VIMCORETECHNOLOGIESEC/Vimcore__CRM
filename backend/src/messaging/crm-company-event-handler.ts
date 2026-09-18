import type { ServiceBusReceivedMessage } from "@azure/service-bus";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import {
  AuthProvisioningConflictError,
  provisionCrmCompanyAdmin,
} from "../services/auth-provisioning.service.js";

const CRM_MODULE = "crm";
const SUBSCRIBED_EVENT = "CompanyModuleSubscribed";
const UNSUBSCRIBED_EVENT = "CompanyModuleUnsubscribed";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidSchema = z.string().regex(UUID_PATTERN);

// Admin fields are optional in the contract (absent when the company has no users yet).
const subscribedSchema = z.object({
  companyId: uuidSchema,
  legalName: z.string().nullish(),
  adminUserId: z.string().nullish(),
  adminEmail: z.string().nullish(),
  adminFullName: z.string().nullish(),
});

const provisionableSchema = z.object({
  companyId: uuidSchema,
  legalName: z.string().trim().min(1),
  adminUserId: uuidSchema,
  adminEmail: z.string().trim().pipe(z.email()),
  adminFullName: z.string().trim().min(1),
});

/** What to do with the message; settlement happens once, after the decision. */
export type MessageDecision =
  | { kind: "complete" }
  | { kind: "deadLetter"; reason: string; description: string }
  | { kind: "abandon" };

/** The peekLock settlement operations this handler needs from a `ServiceBusReceiver`. */
export interface MessageSettler {
  completeMessage(message: ServiceBusReceivedMessage): Promise<void>;
  deadLetterMessage(
    message: ServiceBusReceivedMessage,
    options: { deadLetterReason: string; deadLetterErrorDescription: string },
  ): Promise<void>;
  abandonMessage(message: ServiceBusReceivedMessage): Promise<void>;
}

export type CrmCompanyEventMessage = Pick<
  ServiceBusReceivedMessage,
  "messageId" | "body" | "applicationProperties" | "correlationId"
>;

export interface CrmCompanyEventHandlerDeps {
  provision: typeof provisionCrmCompanyAdmin;
  log: Pick<typeof logger, "debug" | "info" | "warn" | "error">;
}

function decodeBody(body: unknown): unknown {
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    return JSON.parse(Buffer.from(body).toString("utf8"));
  }
  if (typeof body === "string") {
    return JSON.parse(body);
  }
  // Already decoded by the SDK (AMQP value section).
  return body;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function isKnownEventType(eventType: string | undefined): boolean {
  return eventType === SUBSCRIBED_EVENT || eventType === UNSUBSCRIBED_EVENT;
}

/**
 * Decides the settlement of one auth domain event delivered on the shared
 * `vimcore-domain-events` topic (the CRM's own subscription, no broker-side
 * rules: filtering happens here).
 *
 * - other modules / event types, `CompanyModuleUnsubscribed` (log only, out of
 *   this iteration), events without the admin fields -> complete;
 * - malformed JSON / invalid payload, and provisioning conflicts (redelivery
 *   would hit the same wall) -> dead-letter;
 * - anything unexpected (DB down, ...) -> abandon, so the broker redelivers until
 *   MaxDeliveryCount and then dead-letters on its own.
 *
 * Logs carry ids and the correlation id only: never emails, names or secrets.
 */
export async function decideCompanyEvent(
  message: CrmCompanyEventMessage,
  deps: CrmCompanyEventHandlerDeps,
): Promise<MessageDecision> {
  const { log, provision } = deps;
  const properties = message.applicationProperties ?? {};
  const propertyEventType = asString(properties.eventType);
  const propertyModule = asString(properties.module);
  const propertyCorrelationId = asString(properties.correlationId) ?? asString(message.correlationId);

  // Cheap filter on the broker properties before touching the body.
  if (
    (propertyModule !== undefined && propertyModule.toLowerCase() !== CRM_MODULE) ||
    (propertyEventType !== undefined && !isKnownEventType(propertyEventType))
  ) {
    log.debug(
      { messageId: message.messageId, eventType: propertyEventType, module: propertyModule },
      "Ignoring event not handled by the CRM",
    );
    return { kind: "complete" };
  }

  let body: Record<string, unknown>;
  try {
    const decoded = decodeBody(message.body);
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
      throw new Error("payload is not a JSON object");
    }
    body = decoded as Record<string, unknown>;
  } catch {
    log.error(
      { messageId: message.messageId, correlationId: propertyCorrelationId },
      "Malformed company event payload",
    );
    return {
      kind: "deadLetter",
      reason: "MalformedPayload",
      description: "The message body is not a valid JSON object",
    };
  }

  const eventType = propertyEventType ?? asString(body.eventType);
  const moduleName = propertyModule ?? asString(body.module);
  const correlationId = propertyCorrelationId ?? asString(body.correlationId) ?? "unknown";

  if (moduleName?.toLowerCase() !== CRM_MODULE || !isKnownEventType(eventType)) {
    log.debug(
      { messageId: message.messageId, eventType, module: moduleName, correlationId },
      "Ignoring event not handled by the CRM",
    );
    return { kind: "complete" };
  }

  if (eventType === UNSUBSCRIBED_EVENT) {
    log.info(
      { messageId: message.messageId, companyId: asString(body.companyId), correlationId },
      "CompanyModuleUnsubscribed received for crm: not handled in this iteration",
    );
    return { kind: "complete" };
  }

  const base = subscribedSchema.safeParse(body);
  if (!base.success) {
    log.error({ messageId: message.messageId, correlationId }, "Invalid CompanyModuleSubscribed payload");
    return {
      kind: "deadLetter",
      reason: "InvalidPayload",
      description: "CompanyModuleSubscribed payload failed shape validation",
    };
  }

  const { adminUserId, adminEmail, adminFullName } = base.data;
  if (![adminUserId, adminEmail, adminFullName].every((value) => asString(value) !== undefined)) {
    log.warn(
      { messageId: message.messageId, companyId: base.data.companyId, correlationId },
      "CompanyModuleSubscribed without admin fields: nothing to provision",
    );
    return { kind: "complete" };
  }

  const input = provisionableSchema.safeParse(body);
  if (!input.success) {
    log.error({ messageId: message.messageId, correlationId }, "Invalid CompanyModuleSubscribed payload");
    return {
      kind: "deadLetter",
      reason: "InvalidPayload",
      description: "CompanyModuleSubscribed admin fields failed validation",
    };
  }

  try {
    const result = await provision(input.data);
    log.info(
      {
        messageId: message.messageId,
        correlationId,
        outcome: result.outcome,
        companyId: input.data.companyId,
        adminUserId: input.data.adminUserId,
        holdingId: result.holdingId,
        empresaId: result.empresaId,
      },
      "CRM company provisioning processed",
    );
    return { kind: "complete" };
  } catch (error) {
    if (error instanceof AuthProvisioningConflictError) {
      log.error(
        {
          messageId: message.messageId,
          correlationId,
          companyId: input.data.companyId,
          adminUserId: input.data.adminUserId,
          reason: error.reason,
        },
        "CRM company provisioning rejected: conflict with an existing CRM user",
      );
      return { kind: "deadLetter", reason: "ProvisioningConflict", description: error.message };
    }

    log.error(
      {
        messageId: message.messageId,
        correlationId,
        message: error instanceof Error ? error.message : String(error),
      },
      "Failed to provision CRM company",
    );
    return { kind: "abandon" };
  }
}

/** Builds the `processMessage` callback: decide, then settle exactly once. */
export function createCompanyEventHandler(
  settler: MessageSettler,
  deps: CrmCompanyEventHandlerDeps = { provision: provisionCrmCompanyAdmin, log: logger },
): (message: ServiceBusReceivedMessage) => Promise<void> {
  return async (message) => {
    const decision = await decideCompanyEvent(message, deps);
    switch (decision.kind) {
      case "complete":
        await settler.completeMessage(message);
        return;
      case "deadLetter":
        await settler.deadLetterMessage(message, {
          deadLetterReason: decision.reason,
          deadLetterErrorDescription: decision.description,
        });
        return;
      case "abandon":
        await settler.abandonMessage(message);
        return;
    }
  };
}
