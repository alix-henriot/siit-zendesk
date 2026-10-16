const REPLIES_PAGE_SIZE = 200;
const SLACK_ERRORS: Record<string, { status: number; message: string }> = {
  not_in_channel: { status: 403, message: "Le bot n'est pas membre du canal." },
  channel_not_found: { status: 404, message: "Canal introuvable." },
  thread_not_found: { status: 404, message: "Fil introuvable." },
  is_archived: { status: 409, message: "Le canal est archivé." },
  msg_too_long: { status: 400, message: "Message trop long." },
  invalid_auth: { status: 500, message: "Configuration Slack invalide." },
  not_authed: { status: 500, message: "Configuration Slack invalide." },
  missing_scope: { status: 500, message: "Configuration Slack invalide." },
};

const CHANNEL_ID = /^[CGD][A-Z0-9]{2,}$/;
const SLACK_TS = /^\d+\.\d+$/;
// Slack truncates anything longer: https://api.slack.com/methods/chat.postMessage#truncating
const MAX_TEXT_LENGTH = 40_000;
const MAX_USERNAME_LENGTH = 80;
// Proxies and load balancers commonly drop connections idle for 30-60s.
const HEARTBEAT_INTERVAL_MS = 25_000;

// The Events API has no per-thread subscription: the app subscribes to
// `message.channels` (and `message.groups` for private channels), then we
// filter thread replies by their `thread_ts`, which equals the parent's `ts`.

const FORWARDED_SUBTYPES = new Set(["bot_message", "thread_broadcast", "file_share"]);

// Slack retries deliveries it considers failed (no 2xx within 3s), resending
// the same `event_id`. Remembering recent ids keeps open streams from
// receiving the same reply twice. Bounded so memory stays flat.
const MAX_SEEN_EVENT_IDS = 1000;

// https://api.slack.com/authentication/verifying-requests-from-slack
const MAX_REQUEST_AGE_SECONDS = 60 * 5;

export { SLACK_ERRORS, CHANNEL_ID, SLACK_TS, MAX_TEXT_LENGTH, MAX_USERNAME_LENGTH, HEARTBEAT_INTERVAL_MS, REPLIES_PAGE_SIZE, FORWARDED_SUBTYPES, MAX_SEEN_EVENT_IDS, MAX_REQUEST_AGE_SECONDS };