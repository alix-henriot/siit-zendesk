/** jsdom has no fetch/Response, so tests use this minimal stand-in. */
export function fakeResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (typeof body === "string") throw new SyntaxError("not json");
      return body;
    },
  };
}

export function mockFetch() {
  const fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
