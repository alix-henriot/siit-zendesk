import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CHANNEL_ID } from "@/features/slack/constants";

// Read-only config bundled with the deploy: edit the file by hand or by script.
const DATA_PATH = path.join(process.cwd(), "config", "service-channels.json");

const serviceChannelsSchema = z.record(
  z.string(),
  z.object({
    channel_id: z.string().regex(CHANNEL_ID),
    channel_name: z.string(),
  }),
);

export type ServiceChannel = z.infer<typeof serviceChannelsSchema>[string];

/** The service has no dedicated Slack channel: a configuration error, not bad user input. */
export class ServiceChannelNotFoundError extends Error {
  constructor(public readonly serviceId: string) {
    super(`No Slack channel configured for service ${serviceId}.`);
    this.name = "ServiceChannelNotFoundError";
  }
}

let cache: z.infer<typeof serviceChannelsSchema> | undefined;

/** For tests. */
export function resetServiceChannelCache() {
  cache = undefined;
}

async function load() {
  // In development the file is re-read each time so edits apply without a restart.
  if (cache && process.env.NODE_ENV !== "development") return cache;

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(DATA_PATH, "utf-8"));
  } catch (error) {
    throw new Error(
      `Cannot read ${DATA_PATH}: ${error instanceof Error ? error.message : error}`,
    );
  }
  const parsed = serviceChannelsSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Malformed ${DATA_PATH} at "${issue.path.join(".")}": ${issue.message}`,
    );
  }
  cache = parsed.data;
  return cache;
}

export async function getChannelForService(
  serviceId: string,
): Promise<ServiceChannel> {
  const channel = (await load())[serviceId];
  if (!channel) throw new ServiceChannelNotFoundError(serviceId);
  return channel;
}

export async function listServiceChannels(): Promise<
  Record<string, ServiceChannel>
> {
  return { ...(await load()) };
}
