import {
  acknowledge,
  badRequest,
  errorResponse,
  internalError,
} from "@/lib/http/response";
import { dispatchMessageEvent } from "@/features/requests/dispatch-message-event";
import { parseMessageEvent } from "@/features/slack/events";
import { eventPayloadSchema } from "@/features/slack/schemas";
import { isValidSignature } from "@/features/slack/signature";

export async function POST(request: Request) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) {
    console.error(
      "[slack/events] SLACK_SIGNING_SECRET is not set; rejecting request.",
    );
    return errorResponse("Configuration Slack invalide.", 500);
  }

  const body = await request.text();
  if (!isValidSignature(request.headers, body, secret)) {
    return errorResponse("Signature invalide.", 401);
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return badRequest("Requête invalide.");
  }
  const payload = eventPayloadSchema.safeParse(json);
  if (!payload.success) return badRequest("Requête invalide.");

  if (payload.data.type === "url_verification") {
    return Response.json({ challenge: payload.data.challenge });
  }

  const message = parseMessageEvent(payload.data.event);
  if (message) {
    try {
      await dispatchMessageEvent(payload.data.event_id, message);
    } catch (error) {
      // A non-2xx makes Slack retry later, which is what we want for a transient failure.
      console.error("[slack/events] Failed to dispatch event:", error);
      return internalError();
    }
  }

  // Slack retries if it doesn't get a 2xx within 3 seconds.
  return acknowledge();
}
