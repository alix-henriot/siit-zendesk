import { slack } from "@/lib/slack";
import { ErrorCode, type WebAPIPlatformError } from "@slack/web-api";

const SLACK_ERRORS: Record<string, { status: number; message: string }> = {
  not_in_channel: { status: 403, message: "Le bot n'est pas membre du canal." },
  channel_not_found: { status: 404, message: "Canal introuvable." },
  invalid_auth: { status: 500, message: "Configuration Slack invalide." },
};

export async function POST(request: Request) {
  const { text, channel, username, icon_url, thread_ts } = (await request.json()) as {
    text: string;
    channel: string;
    username: string;
    icon_url?: string;
    thread_ts?: string;
  };

  try {
    const res = await slack.chat.postMessage({
    channel,
    text,
    username,
    icon_url: icon_url ?? undefined,
    thread_ts: thread_ts ?? undefined,
    });
    return Response.json({ ok: true, ts: res.ts, channel: res.channel });
    
  } catch (error) {
    const slackError = error as WebAPIPlatformError;
    if (slackError.code === ErrorCode.PlatformError) {
      const known = SLACK_ERRORS[slackError.data.error];
      console.error("Slack error:", slackError.data.error);
      return Response.json(
        { ok: false, error: known?.message ?? "Erreur Slack." },
        { status: known?.status ?? 502 },
      );
    }
    console.error("Unexpected error:", error);
    return Response.json({ ok: false, error: "Erreur interne." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const channel = params.get("channel");
  const ts = params.get("ts");
  if (!channel || !ts) {
    return Response.json({ ok: false, error: "channel et ts sont requis." }, { status: 400 });
  }

  try {
    const res = await slack.conversations.replies({
    channel,
    ts
    });
    console.log("Slack thread messages:", res.messages);
    return Response.json({ messages: res.messages });
    
  } catch (error) {
    const slackError = error as WebAPIPlatformError;
    if (slackError.code === ErrorCode.PlatformError) {
      const known = SLACK_ERRORS[slackError.data.error];
      console.error("Slack error:", slackError.data.error);
      return Response.json(
        { ok: false, error: known?.message ?? "Erreur Slack." },
        { status: known?.status ?? 502 },
      );
    }
    console.error("Unexpected error:", error);
    return Response.json({ ok: false, error: "Erreur interne." }, { status: 500 });
  }
}