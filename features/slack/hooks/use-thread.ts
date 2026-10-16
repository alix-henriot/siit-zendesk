import { useCallback, useEffect, useState } from "react";
import type { ConversationsRepliesResponse } from "@slack/web-api";

type SlackMessage = NonNullable<ConversationsRepliesResponse["messages"]>[number];

// `username` is returned by Slack for messages posted with a custom name but is
// missing from the SDK type. `pending` marks optimistic, not yet confirmed messages.
export type ThreadMessage = SlackMessage & { username?: string; pending?: boolean };

// Slack timestamps are fixed-width decimals, so a numeric comparison keeps replies in order
// even when a live event overtakes an older one.
const byTs = (a: ThreadMessage, b: ThreadMessage) => Number(a.ts) - Number(b.ts);

export function useThread({ channel, ts }: { channel?: string; ts?: string }) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!channel || !ts) {
      setMessages([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setMessages([]);

    const query = new URLSearchParams({ channel, ts });
    const source = new EventSource(`/api/slack/thread?${query}`);

    source.addEventListener("thread", (e) => {
      setMessages(JSON.parse((e as MessageEvent<string>).data));
      setIsLoading(false);
    });

    source.addEventListener("message", (e) => {
      let incoming: ThreadMessage;
      try {
        incoming = JSON.parse((e as MessageEvent<string>).data);
      } catch {
        return;
      }
      if (typeof incoming?.ts !== "string") return;
      // Guard against a reconnect replaying a reply we already have.
      setMessages((prev) =>
        prev.some((m) => m.ts === incoming.ts) ? prev : [...prev, incoming].sort(byTs),
      );
    });

    // EventSource retries on its own; only surface the error if it gave up.
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        setError(new Error("Stream closed"));
        setIsLoading(false);
      }
    };

    return () => source.close();
  }, [channel, ts]);

  // Shows a message immediately; returns the temporary ts to confirm or discard it.
  const addOptimistic = useCallback((text: string, username?: string) => {
    const tempTs = (Date.now() / 1000).toFixed(6);
    setMessages((prev) => [...prev, { ts: tempTs, text, username, pending: true }]);
    return tempTs;
  }, []);

  const confirmOptimistic = useCallback((tempTs: string, ts: string) => {
    setMessages((prev) => {
      // The stream may have delivered the real message before the POST resolved.
      if (prev.some((m) => m.ts === ts)) return prev.filter((m) => m.ts !== tempTs);
      return prev.map((m) => (m.ts === tempTs ? { ...m, ts, pending: false } : m));
    });
  }, []);

  const discardOptimistic = useCallback((tempTs: string) => {
    setMessages((prev) => prev.filter((m) => m.ts !== tempTs));
  }, []);

  return { messages, error, isLoading, addOptimistic, confirmOptimistic, discardOptimistic };
}
