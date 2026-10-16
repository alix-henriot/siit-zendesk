import { z } from "zod";
import { isHttpUrl } from "@/lib/validation/url";
import { isNonEmptyString } from "@/lib/validation/guard";
import {
  CHANNEL_ID,
  MAX_TEXT_LENGTH,
  MAX_USERNAME_LENGTH,
  SLACK_TS,
} from "@/features/slack/constants";

const channelId = (message: string) =>
  z.string({ error: message }).regex(CHANNEL_ID, message);
const slackTs = (message: string) =>
  z.string({ error: message }).regex(SLACK_TS, message);
export const boundedText = (maxLength: number, message: string) =>
  z
    .string({ error: message })
    .refine((value) => isNonEmptyString(value, maxLength), message);

const messageShape = {
  text: boundedText(MAX_TEXT_LENGTH, "text invalide."),
  channel: channelId("channel invalide."),
  username: boundedText(MAX_USERNAME_LENGTH, "username invalide."),
  icon_url: z
    .string({ error: "icon_url invalide." })
    .refine(isHttpUrl, "icon_url invalide.")
    .optional(),
};

const INVALID_BODY = { error: "Requête invalide." };

/** A top-level message in a channel: it starts a new thread. */
export const newMessageSchema = z.object(messageShape, INVALID_BODY);

/** A reply in an existing thread. */
export const threadReplySchema = z.object(
  { ...messageShape, thread_ts: slackTs("thread_ts invalide.") },
  INVALID_BODY,
);

const REQUIRED = "channel et ts sont requis.";
const INVALID = "channel ou ts invalide.";

// Absent query params are `null`; callers map them to `undefined` first.
const requiredParam = z.string({ error: REQUIRED }).min(1, REQUIRED);

export const threadQuerySchema = z.object({
  channel: requiredParam.regex(CHANNEL_ID, INVALID),
  ts: requiredParam.regex(SLACK_TS, INVALID),
});

export type NewMessageBody = z.infer<typeof newMessageSchema>;
export type ThreadReplyBody = z.infer<typeof threadReplySchema>;

// Events API envelope: https://api.slack.com/apis/events-api#callback-field
export const eventPayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url_verification"), challenge: z.string() }),
  z.object({
    type: z.literal("event_callback"),
    event_id: z.string(),
    event: z.looseObject({ type: z.string() }),
  }),
]);

export const messageEventSchema = z.looseObject({
  type: z.literal("message"),
  channel: z.string(),
  ts: z.string(),
});

export type EventPayload = z.infer<typeof eventPayloadSchema>;
