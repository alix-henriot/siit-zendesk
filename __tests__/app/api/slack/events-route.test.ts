/**
 * @jest-environment node
 */
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { POST } from "@/app/api/slack/events/route";
import { slackThreadEvents } from "@/features/slack/client";

jest.mock("node:fs/promises", () => ({ readFile: jest.fn() }));

const readFileMock = readFile as jest.MockedFunction<typeof readFile>;

const SECRET = "test-signing-secret";
const CHANNEL = "C0C842KMHU4";
const THREAD_TS = "1791557199.264939";
const STREAM_KEY = `${CHANNEL}:${THREAD_TS}`;

const REQUESTS = [
  {
    id: "0f6c1d0e-5a52-4b8f-9c4e-2f1a7b9d3e10",
    idempotency_key: "6b1f3a52-8c1d-4e0b-a3a7-9d2c5f7e8a41",
    status: "created",
    zendesk_ticket_id: "6724462",
    service_id: null,
    channel: CHANNEL,
    thread_ts: THREAD_TS,
    ticket_id: null,
    created_at: "2026-10-16T00:00:00.000Z",
    updated_at: "2026-10-16T00:00:00.000Z",
  },
];

let eventCounter = 0;
const nextEventId = () => `Ev${++eventCounter}`;

function sign(body: string, timestamp: string, secret = SECRET) {
  return `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
}

function buildRequest(
  payload: unknown,
  options: {
    timestamp?: string;
    signature?: string;
    omitHeaders?: boolean;
  } = {},
) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (!options.omitHeaders) {
    headers["x-slack-request-timestamp"] = timestamp;
    headers["x-slack-signature"] = options.signature ?? sign(body, timestamp);
  }
  return new Request("http://localhost/api/slack/events", {
    method: "POST",
    headers,
    body,
  });
}

function messageCallback(
  event: Record<string, unknown>,
  eventId = nextEventId(),
) {
  return {
    type: "event_callback",
    event_id: eventId,
    event: {
      type: "message",
      channel: CHANNEL,
      ts: "1791557300.000100",
      ...event,
    },
  };
}

describe("POST /api/slack/events", () => {
  const listener = jest.fn();

  beforeEach(() => {
    process.env.SLACK_SIGNING_SECRET = SECRET;
    readFileMock.mockResolvedValue(JSON.stringify(REQUESTS));
    slackThreadEvents.on(STREAM_KEY, listener);
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    slackThreadEvents.off(STREAM_KEY, listener);
    listener.mockReset();
    readFileMock.mockReset();
    jest.restoreAllMocks();
    delete process.env.SLACK_SIGNING_SECRET;
  });

  describe("request verification", () => {
    it("fails closed when the signing secret is not configured", async () => {
      delete process.env.SLACK_SIGNING_SECRET;

      const res = await POST(
        buildRequest({ type: "url_verification", challenge: "abc" }),
      );

      expect(res.status).toBe(500);
    });

    it("rejects requests without Slack signature headers", async () => {
      const res = await POST(
        buildRequest(
          { type: "url_verification", challenge: "abc" },
          { omitHeaders: true },
        ),
      );

      expect(res.status).toBe(401);
    });

    it("rejects requests signed with another secret", async () => {
      const body = JSON.stringify({
        type: "url_verification",
        challenge: "abc",
      });
      const timestamp = String(Math.floor(Date.now() / 1000));

      const res = await POST(
        buildRequest(body, {
          timestamp,
          signature: sign(body, timestamp, "wrong-secret"),
        }),
      );

      expect(res.status).toBe(401);
    });

    it("rejects signatures of a different length without throwing", async () => {
      const res = await POST(
        buildRequest(
          { type: "url_verification", challenge: "abc" },
          { signature: "v0=short" },
        ),
      );

      expect(res.status).toBe(401);
    });

    it("rejects requests older than five minutes", async () => {
      const timestamp = String(Math.floor(Date.now() / 1000) - 60 * 6);

      const res = await POST(
        buildRequest(
          { type: "url_verification", challenge: "abc" },
          { timestamp },
        ),
      );

      expect(res.status).toBe(401);
    });

    it("rejects non-numeric timestamps", async () => {
      const res = await POST(
        buildRequest(
          { type: "url_verification", challenge: "abc" },
          { timestamp: "not-a-time" },
        ),
      );

      expect(res.status).toBe(401);
    });
  });

  describe("payload validation", () => {
    it("returns 400 for a body that is not JSON", async () => {
      const res = await POST(buildRequest("not json"));

      expect(res.status).toBe(400);
    });

    it("returns 400 for an unknown payload shape", async () => {
      const res = await POST(
        buildRequest({ type: "event_callback", event: "nope" }),
      );

      expect(res.status).toBe(400);
    });
  });

  it("answers the url_verification challenge", async () => {
    const res = await POST(
      buildRequest({ type: "url_verification", challenge: "abc123" }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ challenge: "abc123" });
  });

  describe("message events", () => {
    it("forwards a reply in a linked thread to the thread stream", async () => {
      const payload = messageCallback({ thread_ts: THREAD_TS, text: "Hello" });

      const res = await POST(buildRequest(payload));

      expect(res.status).toBe(200);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(payload.event);
    });

    it.each(["bot_message", "thread_broadcast", "file_share"])(
      "forwards %s replies",
      async (subtype) => {
        await POST(
          buildRequest(messageCallback({ subtype, thread_ts: THREAD_TS })),
        );

        expect(listener).toHaveBeenCalledTimes(1);
      },
    );

    it("acknowledges but does not forward edits", async () => {
      const res = await POST(
        buildRequest(
          messageCallback({
            subtype: "message_changed",
            message: {
              ts: "1791557300.000100",
              thread_ts: THREAD_TS,
              text: "Edited",
            },
          }),
        ),
      );

      expect(res.status).toBe(200);
      expect(listener).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining("message_changed"),
      );
    });

    it("matches deletions through the previous message", async () => {
      await POST(
        buildRequest(
          messageCallback({
            subtype: "message_deleted",
            previous_message: { ts: "1791557300.000100", thread_ts: THREAD_TS },
          }),
        ),
      );

      expect(listener).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining("6724462"),
      );
    });

    it("ignores messages in threads that are not linked to a ticket", async () => {
      const res = await POST(
        buildRequest(messageCallback({ thread_ts: "0000000000.000000" })),
      );

      expect(res.status).toBe(200);
      expect(listener).not.toHaveBeenCalled();
    });

    it("ignores a linked thread_ts posted in another channel", async () => {
      const res = await POST(
        buildRequest(
          messageCallback({ channel: "C_OTHER", thread_ts: THREAD_TS }),
        ),
      );

      expect(res.status).toBe(200);
      expect(listener).not.toHaveBeenCalled();
    });

    it("does not log message text", async () => {
      await POST(
        buildRequest(
          messageCallback({ thread_ts: THREAD_TS, text: "secret-content" }),
        ),
      );

      expect(console.info).not.toHaveBeenCalledWith(
        expect.stringContaining("secret-content"),
      );
    });

    it("forwards a retried delivery only once", async () => {
      const payload = messageCallback({ thread_ts: THREAD_TS });

      await POST(buildRequest(payload));
      const retry = await POST(buildRequest(payload));

      expect(retry.status).toBe(200);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("returns 500 when the thread links cannot be read, so Slack retries", async () => {
      readFileMock.mockRejectedValueOnce(new Error("EACCES"));
      const payload = messageCallback({ thread_ts: THREAD_TS });

      const failed = await POST(buildRequest(payload));
      const retried = await POST(buildRequest(payload));

      expect(failed.status).toBe(500);
      expect(retried.status).toBe(200);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  it("acknowledges non-message events without reading the database", async () => {
    const res = await POST(
      buildRequest({
        type: "event_callback",
        event_id: nextEventId(),
        event: { type: "reaction_added" },
      }),
    );

    expect(res.status).toBe(200);
    expect(readFileMock).not.toHaveBeenCalled();
  });
});
