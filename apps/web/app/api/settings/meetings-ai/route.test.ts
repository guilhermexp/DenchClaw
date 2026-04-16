import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/meetings-ai-settings", () => ({
  getMeetingsAiSettingsState: vi.fn(),
  updateMeetingsAiSettings: vi.fn(),
}));

const {
  getMeetingsAiSettingsState,
  updateMeetingsAiSettings,
} = await import("@/lib/meetings-ai-settings");

describe("meetings ai settings API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("GET returns meetings ai settings", async () => {
    vi.mocked(getMeetingsAiSettingsState).mockReturnValue({
      sectionLabel: "Meetings AI",
      deepgramApiKey: "dg_key",
      deepgramApiKeySource: "config",
      deepgramModel: "nova-3",
      openRouterApiKey: "or_key",
      openRouterApiKeySource: "config",
      openRouterModel: "openai/gpt-4o-mini",
      notes: ["configured"],
    });

    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it("PUT persists meetings ai settings", async () => {
    vi.mocked(updateMeetingsAiSettings).mockReturnValue({
      sectionLabel: "Meetings AI",
      deepgramApiKey: "dg_key",
      deepgramApiKeySource: "config",
      deepgramModel: "nova-3",
      openRouterApiKey: "or_key",
      openRouterApiKeySource: "config",
      openRouterModel: "openai/gpt-4o-mini",
      notes: ["saved"],
    });

    const { PUT } = await import("./route");
    const response = await PUT(new Request("http://localhost/api/settings/meetings-ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deepgramApiKey: "dg_key",
        deepgramModel: "nova-3",
        openRouterApiKey: "or_key",
        openRouterModel: "openai/gpt-4o-mini",
      }),
    }));

    expect(response.status).toBe(200);
    expect(updateMeetingsAiSettings).toHaveBeenCalledWith({
      deepgramApiKey: "dg_key",
      deepgramModel: "nova-3",
      openRouterApiKey: "or_key",
      openRouterModel: "openai/gpt-4o-mini",
    });
  });
});
