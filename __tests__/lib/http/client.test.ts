import { fakeResponse, mockFetch } from "@/test-utils/fetch";
import { fetchJson, postJson, toError } from "@/lib/http/client";

const fetchMock = mockFetch();
const respond = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValue(fakeResponse(body, status));

describe("fetchJson", () => {
  it("returns the body of a successful response", async () => {
    respond({ ok: true, value: 1 });
    await expect(fetchJson("/x", "fallback")).resolves.toEqual({
      ok: true,
      value: 1,
    });
  });

  it("throws the API's error message", async () => {
    respond({ ok: false, error: "Nope." }, 400);
    await expect(fetchJson("/x", "fallback")).rejects.toThrow("Nope.");
  });

  it("falls back when the body is not JSON", async () => {
    respond("<html>", 502);
    await expect(fetchJson("/x", "fallback")).rejects.toThrow("fallback");
  });

  it("treats ok: false on a 200 as a failure", async () => {
    respond({ ok: false });
    await expect(fetchJson("/x", "fallback")).rejects.toThrow("fallback");
  });
});

describe("postJson", () => {
  it("sends the body as JSON", async () => {
    respond({ ok: true });
    await postJson("/x", { a: 1 }, "fallback");
    expect(fetchMock).toHaveBeenCalledWith("/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"a":1}',
    });
  });
});

describe("toError", () => {
  it("keeps errors and wraps anything else", () => {
    const error = new Error("x");
    expect(toError(error)).toBe(error);
    expect(toError("boom").message).toBe("boom");
  });
});
