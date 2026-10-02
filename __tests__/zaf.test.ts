// lib/__tests__/zaf.test.ts
describe("getZafClient", () => {
  const fakeClient = { get: jest.fn() };
  const initMock = jest.fn(() => fakeClient);
  let getZafClient: typeof import("../lib/zendesk/zaf").getZafClient;

  beforeEach(() => {
    jest.resetModules();   // fresh module = fresh `client = null`
    initMock.mockClear();
    (window as any).ZAFClient = { init: initMock };
    getZafClient = require("../lib/zendesk/zaf").getZafClient;
  });

  afterEach(() => {
    delete (window as any).ZAFClient;
  });

  it("returns null when the SDK is not loaded", () => {
    delete (window as any).ZAFClient;
    expect(getZafClient()).toBeNull();
  });

  it("calls init() only once, however many times it's called", () => {
    const first = getZafClient();
    const second = getZafClient();

    expect(initMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second); // same reference
  });
});