import { useCallback } from "react";
import type { ThreadReplyBody } from "@/features/slack/schemas";
import { usePostMessage } from "@/features/slack/hooks/use-post-message";

export function useThreadReply({
  channel,
  ts,
  username,
  iconUrl,
}: {
  channel?: string;
  ts?: string;
  username: string;
  iconUrl?: string;
}) {
  const { post, isPending, error } =
    usePostMessage<ThreadReplyBody>("/api/slack/thread");

  const reply = useCallback(
    (text: string) => {
      if (!channel || !ts) throw new Error("Thread non sélectionné.");
      // An empty string would fail the server's URL validation, so it is omitted.
      return post({
        channel,
        thread_ts: ts,
        text,
        username,
        icon_url: iconUrl || undefined,
      });
    },
    [post, channel, ts, username, iconUrl],
  );

  return { reply, isPending, error };
}
