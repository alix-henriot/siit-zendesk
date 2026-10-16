import "server-only";
import type { MessageEvent as SlackMessageEvent } from "@slack/types";
import { messageEventSchema } from "@/features/slack/schemas";
import { MAX_SEEN_EVENT_IDS } from "@/features/slack/constants";

const seenEventIds = new Set<string>();

/** Slack retries deliveries it thinks failed; true if this event was already handled. */
export function hasSeenEventId(eventId: string): boolean {
  return seenEventIds.has(eventId);
}

export function rememberEventId(eventId: string) {
  seenEventIds.add(eventId);
  if (seenEventIds.size > MAX_SEEN_EVENT_IDS) {
    // Sets iterate in insertion order, so the first entry is the oldest.
    seenEventIds.delete(seenEventIds.values().next().value as string);
  }
}

/** Key under which a thread's stream listens on `slackThreadEvents`. */
export function threadStreamKey(channel: string, ts: string): string {
  return `${channel}:${ts}`;
}

/** Narrows an untrusted inner event to a message event, or `null` for any other event. */
export function parseMessageEvent(event: unknown): SlackMessageEvent | null {
  const parsed = messageEventSchema.safeParse(event);
  // Only the fields read here are validated; Slack owns the rest of the shape.
  return parsed.success ? (parsed.data as unknown as SlackMessageEvent) : null;
}

function threadTsOf(event: { ts: string }): string {
  return ("thread_ts" in event && typeof event.thread_ts === "string" && event.thread_ts) || event.ts;
}

// Edits and deletions describe the affected message in a nested object.
export function resolveThreadTs(event: SlackMessageEvent): string {
  if (event.subtype === "message_changed") return threadTsOf(event.message);
  if (event.subtype === "message_deleted") return threadTsOf(event.previous_message);
  return threadTsOf(event);
}
