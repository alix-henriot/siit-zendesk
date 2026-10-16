import "server-only";
import {
  WebAPIHTTPError,
  WebAPIPlatformError,
  WebAPIRateLimitedError,
  WebAPIRequestError,
} from "@slack/web-api";
import type { ZodType } from "zod";
import { badRequest, errorResponse, internalError } from "@/lib/http/response";
import { postSlackMessage, type SlackMessageInput } from "@/features/slack/post-message";
import { SLACK_ERRORS } from "@/features/slack/constants";

export function toSlackErrorResponse(error: unknown): Response {
  if (error instanceof WebAPIPlatformError) {
    const known = SLACK_ERRORS[error.data.error];
    console.error("[slack] Slack error:", error.data.error);
    return errorResponse(
      known?.message ?? "Erreur Slack.",
      known?.status ?? 502,
    );
  }
  if (error instanceof WebAPIRateLimitedError) {
    console.warn(
      `[slack] Rate limited, retry after ${error.retryAfter}s`,
    );
    return errorResponse("Trop de requêtes vers Slack.", 429, {
      "Retry-After": String(error.retryAfter),
    });
  }
  if (error instanceof WebAPIRequestError || error instanceof WebAPIHTTPError) {
    console.error("[slack] Slack unreachable:", error.message);
    return errorResponse("Slack est injoignable.", 502);
  }
  console.error("[slack] Unexpected error:", error);
  return internalError();
}

/** Validates the JSON body with `schema`, then posts it to Slack. */
export async function handlePostMessage(
  request: Request,
  schema: ZodType<SlackMessageInput>,
): Promise<Response> {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return badRequest("Requête invalide.");
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);

  try {
    const { ts, channel } = await postSlackMessage(parsed.data);
    return Response.json({ ok: true, ts, channel });
  } catch (error) {
    return toSlackErrorResponse(error);
  }
}
