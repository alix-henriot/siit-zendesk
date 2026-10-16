import { slackThreadEvents } from "@/features/slack/client";
import type { ConversationsRepliesResponse } from "@slack/web-api";
import type { MessageEvent as SlackMessageEvent } from "@slack/types";
import { threadStreamKey } from "@/features/slack/events";
import { fetchThread } from "@/features/slack/fetch-thread";
import { HEARTBEAT_INTERVAL_MS } from "@/features/slack/constants";
import { threadQuerySchema, threadReplySchema } from "@/features/slack/schemas";
import { badRequest } from "@/lib/http/response";
import { sseResponse } from "@/lib/http/sse";
import { handlePostMessage, toSlackErrorResponse } from "@/features/slack/http";

// Replies in an existing thread; new threads are created through /api/request.
export async function POST(request: Request) {
  return handlePostMessage(request, threadReplySchema);
}

// Server-Sent Events: the thread history first, then each new reply forwarded by /api/slack/events.
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const query = threadQuerySchema.safeParse({
    channel: params.get("channel") ?? undefined,
    ts: params.get("ts") ?? undefined,
  });
  if (!query.success) return badRequest(query.error.issues[0].message);
  const { channel, ts } = query.data;

  const streamKey = threadStreamKey(channel, ts);

  // Subscribe before fetching the history so replies posted in the meantime
  // are buffered instead of lost.
  const pending: SlackMessageEvent[] = [];
  let forward = (message: SlackMessageEvent) => {
    pending.push(message);
  };
  const onMessage = (message: SlackMessageEvent) => forward(message);
  slackThreadEvents.on(streamKey, onMessage);

  let history: NonNullable<ConversationsRepliesResponse["messages"]>;
  try {
    history = (await fetchThread(channel, ts)) ?? [];
  } catch (error) {
    slackThreadEvents.off(streamKey, onMessage);
    return toSlackErrorResponse(error);
  }

  return sseResponse({
    signal: request.signal,
    heartbeatMs: HEARTBEAT_INTERVAL_MS,
    setup(send) {
      send("thread", history);
      const historyTs = new Set(history.map((message) => message.ts));
      forward = (message) => send("message", message);
      for (const message of pending) {
        if (!historyTs.has(message.ts)) forward(message);
      }
      return () => slackThreadEvents.off(streamKey, onMessage);
    },
  });
}
