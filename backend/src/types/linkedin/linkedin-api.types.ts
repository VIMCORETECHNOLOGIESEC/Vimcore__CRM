import type {
  LinkedInLeadFormBody,
  LinkedInLeadFormResponseBody,
} from "../../schemas/linkedin/linkedin-leads.schema.js";
import type { LinkedInTokenResponseBody } from "../../schemas/linkedin/linkedin-oauth.schema.js";
import type { LinkedInNotificationBody } from "../../schemas/linkedin/linkedin-webhook.schema.js";

export type LinkedInUrn = string;
export type LinkedInOwnerUrn = LinkedInUrn;
export type LinkedInVersionedFormUrn = LinkedInUrn;
export type LinkedInLeadFormResponseId = string;
export type LinkedInNotificationId = string;

export type LinkedInTokenResponse = LinkedInTokenResponseBody;
export type LinkedInNotification = LinkedInNotificationBody;
export type LinkedInLeadFormResponse = LinkedInLeadFormResponseBody;
export type LinkedInLeadForm = LinkedInLeadFormBody;
