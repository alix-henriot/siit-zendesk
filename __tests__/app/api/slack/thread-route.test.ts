/**
 * @jest-environment node
 */
import {
  WebAPIPlatformError,
  WebAPIRateLimitedError,
  WebAPIRequestError,
} from "@slack/web-api";
import { GET, POST } from "@/app/api/slack/thread/route";
import { slack, slackThreadEvents } from "@/features/slack/client";
import type { MessageEvent as SlackMessageEvent } from "@slack/types";

// Relative path: jest.mock() specifiers bypass the `@/` alias transform.
jest.mock("../../../../features/slack/client", () => {
  const { EventEmitter } =
    jest.requireActual<typeof import("node:events")>("node:events");
  return {
    slack: {
      chat: { postMessage: jest.fn() },
      conversations: { replies: jest.fn() },
    },
    slackThreadEvents: new EventEmitter(),
  };
});

const postMessage = slack.chat.postMessage as unknown as jest.Mock;
const replies = slack.conversations.replies as unknown as jest.Mock;

const CHANNEL = "C0C842KMHU4";
const THREAD_TS = "1791557199.264939";
const STREAM_KEY = `${CHANNEL}:${THREAD_TS}`;

const VALID_BODY = {
  text: "Hello from Zendesk",
  channel: CHANNEL,
  username: "Agent",
  icon_url: "https://example.com/avatar.png",
  thread_ts: THREAD_TS,
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/slack/thread", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function getRequest(query: Record<string, string>, signal?: AbortSignal) {
  const url = new URL("http://localhost/api/slack/thread");
  for (const [key, value] of Object.entries(query))
    url.searchParams.set(key, value);
  return new Request(url, { signal });
}

function platformError(error: string) {
  return new WebAPIPlatformError({ ok: false, error });
}

function liveMessage(ts: string, text = "reply"): SlackMessageEvent {
  return {
    type: "message",
    channel: CHANNEL,
    ts,
    thread_ts: THREAD_TS,
    text,
  } as SlackMessageEvent;
}

// Streams left open keep their heartbeat interval alive and stop Jest from exiting.
const openReaders: ReadableStreamDefaultReader<Uint8Array>[] = [];

// Parses the SSE stream frame by frame; comment frames (heartbeats) are returned raw.
function sseReader(response: Response) {
  const reader = response.body!.getReader();
  openReaders.push(reader);
  const decoder = new TextDecoder();
  let buffer = "";

  async function next(): Promise<
    { event: string; data: unknown } | { comment: string }
  > {
    while (!buffer.includes("\n\n")) {
      const { value, done } = await reader.read();
      if (done) throw new Error("stream ended");
      buffer += decoder.decode(value, { stream: true });
    }
    const end = buffer.indexOf("\n\n");
    const frame = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    if (frame.startsWith(":")) return { comment: frame };
    const event = /^event: (.*)$/m.exec(frame)![1];
    const data: unknown = JSON.parse(/^data: (.*)$/m.exec(frame)![1]);
    return { event, data };
  }

  return { next, reader };
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  await Promise.all(openReaders.splice(0).map((reader) => reader.cancel()));
  postMessage.mockReset();
  replies.mockReset();
  slackThreadEvents.removeAllListeners();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("POST /api/slack/thread", () => {
  it("posts the message and returns its ts and channel", async () => {
    postMessage.mockResolvedValue({
      ok: true,
      ts: "1791557300.000100",
      channel: CHANNEL,
    });

    const res = await POST(postRequest(VALID_BODY));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      ts: "1791557300.000100",
      channel: CHANNEL,
    });
    expect(postMessage).toHaveBeenCalledWith(VALID_BODY);
  });

  it("accepts a reply without icon_url", async () => {
    postMessage.mockResolvedValue({ ok: true, ts: "1", channel: CHANNEL });
    const { text, channel, username, thread_ts } = VALID_BODY;

    const res = await POST(postRequest({ text, channel, username, thread_ts }));

    expect(res.status).toBe(200);
    expect(postMessage).toHaveBeenCalledWith({
      text,
      channel,
      username,
      thread_ts,
    });
  });

  it("rejects a top-level message: new threads go through /api/request", async () => {
    const { text, channel, username } = VALID_BODY;

    const res = await POST(postRequest({ text, channel, username }));

    expect(res.status).toBe(400);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("does not forward unknown fields to Slack", async () => {
    postMessage.mockResolvedValue({ ok: true, ts: "1", channel: CHANNEL });

    await POST(
      postRequest({ ...VALID_BODY, token: "xoxb-injected", as_user: true }),
    );

    expect(postMessage).toHaveBeenCalledWith(VALID_BODY);
  });

  it("returns 400 for a body that is not JSON", async () => {
    const res = await POST(postRequest("not json"));

    expect(res.status).toBe(400);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing text", { text: undefined }, "text invalide."],
    ["a blank text", { text: "   " }, "text invalide."],
    ["a text over 40000 chars", { text: "a".repeat(40_001) }, "text invalide."],
    [
      "a channel name instead of an id",
      { channel: "#general" },
      "channel invalide.",
    ],
    ["a missing username", { username: undefined }, "username invalide."],
    [
      "a non-http icon_url",
      { icon_url: "javascript:alert(1)" },
      "icon_url invalide.",
    ],
    [
      "a malformed thread_ts",
      { thread_ts: "yesterday" },
      "thread_ts invalide.",
    ],
  ])("returns 400 for %s", async (_label, override, error) => {
    const res = await POST(postRequest({ ...VALID_BODY, ...override }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, error });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["not_in_channel", 403],
    ["channel_not_found", 404],
    ["is_archived", 409],
    ["invalid_auth", 500],
    ["some_new_slack_error", 502],
  ])("maps the Slack %s error to %i", async (slackError, status) => {
    postMessage.mockRejectedValue(platformError(slackError));

    const res = await POST(postRequest(VALID_BODY));

    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toMatchObject({ ok: false });
  });

  it("returns 429 with Retry-After when Slack rate limits", async () => {
    postMessage.mockRejectedValue(new WebAPIRateLimitedError(30));

    const res = await POST(postRequest(VALID_BODY));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("returns 502 when Slack is unreachable", async () => {
    postMessage.mockRejectedValue(
      new WebAPIRequestError(new Error("ECONNRESET")),
    );

    const res = await POST(postRequest(VALID_BODY));

    expect(res.status).toBe(502);
  });

  it("returns 500 without leaking details on unexpected errors", async () => {
    postMessage.mockRejectedValue(new Error("secret internal detail"));

    const res = await POST(postRequest(VALID_BODY));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "Erreur interne.",
    });
  });
});

describe("GET /api/slack/thread", () => {
  const parent = { ts: THREAD_TS, text: "Ticket opened" };
  const firstReply = { ts: "1791557200.000100", text: "First reply" };

  it("returns 400 when channel or ts is missing", async () => {
    const res = await GET(getRequest({ channel: CHANNEL }));

    expect(res.status).toBe(400);
    expect(replies).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed channel or ts", async () => {
    const res = await GET(getRequest({ channel: "general", ts: "abc" }));

    expect(res.status).toBe(400);
  });

  it("maps Slack errors and leaves no listener behind", async () => {
    replies.mockRejectedValue(platformError("thread_not_found"));

    const res = await GET(getRequest({ channel: CHANNEL, ts: THREAD_TS }));

    expect(res.status).toBe(404);
    expect(slackThreadEvents.listenerCount(STREAM_KEY)).toBe(0);
  });

  it("streams the thread history as the first event", async () => {
    replies.mockResolvedValue({ ok: true, messages: [parent, firstReply] });

    const res = await GET(getRequest({ channel: CHANNEL, ts: THREAD_TS }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    await expect(sseReader(res).next()).resolves.toEqual({
      event: "thread",
      data: [parent, firstReply],
    });
  });

  it("follows pagination to load the full history", async () => {
    replies
      .mockResolvedValueOnce({
        ok: true,
        messages: [parent],
        response_metadata: { next_cursor: "page2" },
      })
      .mockResolvedValueOnce({
        ok: true,
        messages: [firstReply],
        response_metadata: { next_cursor: "" },
      });

    const res = await GET(getRequest({ channel: CHANNEL, ts: THREAD_TS }));

    await expect(sseReader(res).next()).resolves.toEqual({
      event: "thread",
      data: [parent, firstReply],
    });
    expect(replies).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "page2" }),
    );
  });

  it("forwards live replies emitted by the events route", async () => {
    replies.mockResolvedValue({ ok: true, messages: [parent] });
    const res = await GET(getRequest({ channel: CHANNEL, ts: THREAD_TS }));
    const sse = sseReader(res);
    await sse.next();

    const reply = liveMessage("1791557300.000100");
    slackThreadEvents.emit(STREAM_KEY, reply);

    await expect(sse.next()).resolves.toEqual({
      event: "message",
      data: reply,
    });
  });

  it("keeps replies posted while the history loads, without duplicating them", async () => {
    const raced = liveMessage("1791557300.000100", "posted during fetch");
    const alreadyInHistory = liveMessage(firstReply.ts, firstReply.text);
    replies.mockImplementation(async () => {
      slackThreadEvents.emit(STREAM_KEY, alreadyInHistory);
      slackThreadEvents.emit(STREAM_KEY, raced);
      return { ok: true, messages: [parent, firstReply] };
    });

    const res = await GET(getRequest({ channel: CHANNEL, ts: THREAD_TS }));
    const sse = sseReader(res);

    await expect(sse.next()).resolves.toMatchObject({ event: "thread" });
    await expect(sse.next()).resolves.toEqual({
      event: "message",
      data: raced,
    });
  });

  it("sends a heartbeat to keep the connection open", async () => {
    jest.useFakeTimers();
    replies.mockResolvedValue({ ok: true, messages: [] });
    const res = await GET(getRequest({ channel: CHANNEL, ts: THREAD_TS }));
    const sse = sseReader(res);
    await sse.next();

    jest.advanceTimersByTime(25_000);

    await expect(sse.next()).resolves.toEqual({ comment: ": ping" });
  });

  it("unsubscribes when the client disconnects", async () => {
    replies.mockResolvedValue({ ok: true, messages: [] });
    const controller = new AbortController();
    const res = await GET(
      getRequest({ channel: CHANNEL, ts: THREAD_TS }, controller.signal),
    );
    const sse = sseReader(res);
    await sse.next();
    expect(slackThreadEvents.listenerCount(STREAM_KEY)).toBe(1);

    controller.abort();

    expect(slackThreadEvents.listenerCount(STREAM_KEY)).toBe(0);
    await expect(sse.reader.read()).resolves.toMatchObject({ done: true });
    expect(() =>
      slackThreadEvents.emit(STREAM_KEY, liveMessage("1")),
    ).not.toThrow();
  });

  it("unsubscribes when the stream is cancelled", async () => {
    replies.mockResolvedValue({ ok: true, messages: [] });
    const res = await GET(getRequest({ channel: CHANNEL, ts: THREAD_TS }));

    await res.body!.cancel();

    expect(slackThreadEvents.listenerCount(STREAM_KEY)).toBe(0);
  });
});
