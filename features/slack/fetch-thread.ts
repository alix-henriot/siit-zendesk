import "server-only";
import { slack } from "@/features/slack/client";
import { REPLIES_PAGE_SIZE } from "@/features/slack/constants";
import type { ConversationsRepliesResponse } from "@slack/web-api";

export async function fetchThread(channel: string, ts: string): Promise<ConversationsRepliesResponse["messages"]> {
  const messages: ConversationsRepliesResponse["messages"] = [];
  let cursor: string | undefined;
  do {
    const res = await slack.conversations.replies({
      channel,
      ts,
      cursor,
      limit: REPLIES_PAGE_SIZE,
    });
    messages.push(...(res.messages ?? []));
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return messages;
}