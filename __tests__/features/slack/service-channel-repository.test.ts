/**
 * @jest-environment node
 */
import { readFile } from "node:fs/promises";
import {
  ServiceChannelNotFoundError,
  getChannelForService,
  listServiceChannels,
  resetServiceChannelCache,
} from "@/features/slack/service-channel.repository";

jest.mock("node:fs/promises", () => ({ readFile: jest.fn() }));

const readFileMock = readFile as jest.MockedFunction<typeof readFile>;

const VALID = {
  svc_a: { channel_id: "C0123456789", channel_name: "#a" },
  svc_b: { channel_id: "C0123456790", channel_name: "#b" },
};

beforeEach(() => {
  resetServiceChannelCache();
  readFileMock.mockReset();
});

describe("service channel repository", () => {
  it("returns the channel mapped to a service", async () => {
    readFileMock.mockResolvedValue(JSON.stringify(VALID));

    await expect(getChannelForService("svc_b")).resolves.toEqual(VALID.svc_b);
    await expect(listServiceChannels()).resolves.toEqual(VALID);
  });

  it("caches the parsed file outside development", async () => {
    readFileMock.mockResolvedValue(JSON.stringify(VALID));

    await getChannelForService("svc_a");
    await getChannelForService("svc_b");

    expect(readFileMock).toHaveBeenCalledTimes(1);
  });

  it("throws ServiceChannelNotFoundError for an unmapped service", async () => {
    readFileMock.mockResolvedValue(JSON.stringify(VALID));

    const error = await getChannelForService("svc_missing").catch((e) => e);

    expect(error).toBeInstanceOf(ServiceChannelNotFoundError);
    expect(error.serviceId).toBe("svc_missing");
  });

  it.each([
    ["invalid JSON", "{ nope"],
    [
      "a channel id that is not a Slack id",
      JSON.stringify({ svc_a: { channel_id: "general", channel_name: "#a" } }),
    ],
    [
      "a missing channel_name",
      JSON.stringify({ svc_a: { channel_id: "C0123456789" } }),
    ],
    ["a non-object root", JSON.stringify([])],
  ])("fails loudly on %s", async (_label, content) => {
    readFileMock.mockResolvedValue(content);

    await expect(getChannelForService("svc_a")).rejects.toThrow(
      /service-channels\.json/,
    );
  });

  it("fails loudly when the file is missing", async () => {
    readFileMock.mockRejectedValue(new Error("ENOENT"));

    await expect(getChannelForService("svc_a")).rejects.toThrow(
      /service-channels\.json/,
    );
  });
});
