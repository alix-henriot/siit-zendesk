import { render, screen } from "@testing-library/react";
import { ZafProvider, useZaf } from "@/components/zaf-provider";
import { getZafClient } from "@/lib/zendesk/zaf";

jest.mock("../lib/zendesk/zaf");
const mockGetZafClient = getZafClient as jest.Mock;

function Consumer() {
  const client = useZaf();
  return <div>client ready: {String(!!client)}</div>;
}

describe("ZafProvider", () => {
  it("renders children once the client is available", async () => {
    mockGetZafClient.mockReturnValue({ get: jest.fn() });

    render(
      <ZafProvider>
        <Consumer />
      </ZafProvider>
    );

    expect(await screen.findByText("client ready: true")).toBeInTheDocument();
  });

  it("renders nothing and logs an error when the SDK is missing", () => {
    mockGetZafClient.mockReturnValue(null);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ZafProvider>
        <div>child</div>
      </ZafProvider>
    );

    expect(screen.queryByText("child")).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith("ZAF SDK failed to load");
    errorSpy.mockRestore();
  });
});

describe("useZaf", () => {
  it("throws when used outside the provider", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Consumer />)).toThrow(
      "useZaf must be used inside <ZafProvider>"
    );
    errorSpy.mockRestore();
  });
});