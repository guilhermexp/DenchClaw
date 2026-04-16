import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/meetings", () => ({
  listMeetings: vi.fn(),
}));

const { listMeetings } = await import("@/lib/meetings");

describe("meetings list API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns recent meetings", async () => {
    vi.mocked(listMeetings).mockResolvedValue([
      {
        meetingId: "m1",
        title: "Kickoff",
        status: "ready",
        durationSeconds: 90,
        updatedAt: "2026-04-16T10:10:00.000Z",
        openHref: "/?entry=meetings:m1",
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      meetings: [
        {
          meetingId: "m1",
          title: "Kickoff",
          status: "ready",
          durationSeconds: 90,
          updatedAt: "2026-04-16T10:10:00.000Z",
          openHref: "/?entry=meetings:m1",
        },
      ],
    });
  });
});
