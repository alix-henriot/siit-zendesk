import "server-only";
import { slack } from "@/features/slack/client";
import type { NewMessageBody } from "@/features/slack/schemas";

export type SlackMessageInput = NewMessageBody & { thread_ts?: string };

export class SlackPostError extends Error {
  constructor() {
    super("Slack did not return the posted message's ts and channel.");
    this.name = "SlackPostError";
  }
}

/** Slack SDK errors (`WebAPI*Error`) propagate untouched; callers map them to HTTP. */
export async function postSlackMessage(
  message: SlackMessageInput,
): Promise<{ ts: string; channel: string }> {
  const res = await slack.chat.postMessage(message);
  if (!res.ts || !res.channel) throw new SlackPostError();
  return { ts: res.ts, channel: res.channel };
}
