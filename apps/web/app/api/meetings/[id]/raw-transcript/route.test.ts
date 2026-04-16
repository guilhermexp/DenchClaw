import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/meetings", () => ({
  getMeetingRawTranscript: vi.fn(),
}));

const { getMeetingRawTranscript } = await import("@/lib/meetings");

describe("meeting raw transcript API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns transcript payload for an existing meeting", async () => {
    vi.mocked(getMeetingRawTranscript).mockResolvedValue({
      meetingId: "m1",
      transcriptText: "linha 1\nlinha 2",
      language: "pt-BR",
      provider: "deepgram",
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/meetings/m1/raw-transcript"),
      { params: Promise.resolve({ id: "m1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      meetingId: "m1",
      transcriptText: "linha 1\nlinha 2",
      provider: "deepgram",
    });
  });

  it("returns 404 when transcript is missing", async () => {
    vi.mocked(getMeetingRawTranscript).mockResolvedValue(null);

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/meetings/missing/raw-transcript"),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(response.status).toBe(404);
  });
});
