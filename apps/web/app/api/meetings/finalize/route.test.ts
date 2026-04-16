import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/meetings", () => ({
  finalizeMeetingUpload: vi.fn(),
}));

const { finalizeMeetingUpload } = await import("@/lib/meetings");

describe("meetings finalize API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects requests without file", async () => {
    const { POST } = await import("./route");
    const form = new FormData();
    form.set("source", "import");

    const response = await POST(
      new Request("http://localhost/api/meetings/finalize", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(400);
  });

  it("delegates to the meeting finalizer and returns the created ids", async () => {
    vi.mocked(finalizeMeetingUpload).mockResolvedValue({
      meetingId: "meeting-entry-1",
      audioAssetId: "audio-entry-1",
      transcriptAssetId: "transcript-entry-1",
      title: "Kickoff Projeto X",
      openHref: "/?entry=meetings:meeting-entry-1",
      status: "ready",
    });

    const { POST } = await import("./route");
    const form = new FormData();
    form.set("file", new File(["audio"], "call.webm", { type: "audio/webm" }));
    form.set("source", "record");
    form.set("durationSeconds", "42");

    const response = await POST(
      new Request("http://localhost/api/meetings/finalize", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(200);
    expect(finalizeMeetingUpload).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      meetingId: "meeting-entry-1",
      openHref: "/?entry=meetings:meeting-entry-1",
      status: "ready",
    });
  });
});
