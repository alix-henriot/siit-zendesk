import { createHmac, timingSafeEqual } from "node:crypto";
import { MAX_REQUEST_AGE_SECONDS } from "@/features/slack/constants";

export function isValidSignature(headers: Headers, body: string, secret: string): boolean {
  const timestamp = headers.get("x-slack-request-timestamp");
  const signature = headers.get("x-slack-signature");
  if (!timestamp || !signature) return false;

  const requestTime = Number(timestamp);
  if (!Number.isFinite(requestTime)) return false;
  // Rejects replays of captured requests.
  if (Math.abs(Date.now() / 1000 - requestTime) > MAX_REQUEST_AGE_SECONDS) return false;

  const expected = Buffer.from(
    `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`,
  );
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
