// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MeetingsAiSettingsPanel } from "./meetings-ai-settings-panel";

const initialState = {
  sectionLabel: "Meetings AI",
  deepgramApiKey: "dg_key",
  deepgramApiKeySource: "config" as const,
  deepgramModel: "nova-3",
  openRouterApiKey: "or_key",
  openRouterApiKeySource: "config" as const,
  openRouterModel: "openai/gpt-4o-mini",
  notes: ["configured"],
};

describe("MeetingsAiSettingsPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders current meetings ai settings", () => {
    render(<MeetingsAiSettingsPanel initialState={initialState} />);

    expect(screen.getByRole("heading", { name: "Meetings AI" })).toBeInTheDocument();
    expect(screen.getByLabelText("Deepgram Model")).toHaveValue("nova-3");
    expect(screen.getByLabelText("OpenRouter Model")).toHaveValue("openai/gpt-4o-mini");
  });

  it("saves updated settings through the API", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      ...initialState,
      deepgramModel: "nova-2",
      notes: ["saved"],
    }))) as typeof fetch;

    render(<MeetingsAiSettingsPanel initialState={initialState} />);

    await user.clear(screen.getByLabelText("Deepgram Model"));
    await user.type(screen.getByLabelText("Deepgram Model"), "nova-2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/settings/meetings-ai", expect.objectContaining({
        method: "PUT",
      }));
    });

    await waitFor(() => {
      expect(screen.getByText("saved")).toBeInTheDocument();
    });
  });
});
