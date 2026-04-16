// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

import { MeetingsPage } from "./meetings-page";

describe("MeetingsPage", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        meetings: [
          {
            meetingId: "m1",
            title: "Kickoff Projeto X",
            status: "ready",
            durationSeconds: 125,
            updatedAt: "2026-04-16T10:00:00.000Z",
            openHref: "/?entry=meetings:m1",
          },
        ],
      }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders actions and loads previous meetings", async () => {
    render(<MeetingsPage />);

    expect(screen.getByRole("button", { name: "Start Recording" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import Audio" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Kickoff Projeto X")).toBeInTheDocument();
    });
  });
});
