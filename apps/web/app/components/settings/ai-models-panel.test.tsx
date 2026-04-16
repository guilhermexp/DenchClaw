// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AiModelsPanel, type AiModelsPageState } from "./ai-models-panel";

const state: AiModelsPageState = {
  sectionLabel: "Hermes",
  cliAvailable: true,
  cliPath: "/usr/local/bin/hermes",
  cliVersion: "Hermes Agent v0.9.0",
  acpAvailable: true,
  hermesHome: "/Users/test/.hermes",
  configPath: "/Users/test/.hermes/config.yaml",
  envPath: "/Users/test/.hermes/.env",
  configExists: true,
  defaultModel: "gpt-5.4",
  provider: "openai-codex",
  baseUrl: "https://chatgpt.com/backend-api/codex",
  toolsets: ["hermes-cli"],
  fallbackProviders: [],
  configuredProviders: [
    {
      id: "openai-codex",
      baseUrl: "https://chatgpt.com/backend-api/codex",
      keys: ["base_url"],
    },
  ],
  providersYaml: [
    "openai-codex:",
    "  base_url: https://chatgpt.com/backend-api/codex",
  ].join("\n"),
  notes: ["ok"],
};

describe("AiModelsPanel", () => {
  it("renders Hermes-first configuration UI", () => {
    render(<AiModelsPanel initialState={state} />);

    expect(screen.getByRole("heading", { name: "Hermes" })).toBeInTheDocument();
    expect(screen.getByText(/trocar modelo, provider e providers nomeados direto pela UI/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/default model/i)).toHaveValue("gpt-5.4");
    expect(screen.getAllByText("openai-codex").length).toBeGreaterThan(0);
  });

  it("refreshes Hermes config from the settings endpoint", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      ...state,
      defaultModel: "hermes-updated-model",
    }))) as typeof fetch;

    render(<AiModelsPanel initialState={state} />);

    await user.click(screen.getByRole("button", { name: /refresh hermes config/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("hermes-updated-model")).toBeInTheDocument();
    });
  });

  it("saves editable Hermes model settings through the API", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async (input, init) => {
      if (typeof input === "string" && input === "/api/settings/hermes" && init?.method === "PUT") {
        return new Response(JSON.stringify({
          ...state,
          defaultModel: "glm-5.1",
          provider: "zai",
          baseUrl: "https://api.z.ai/api/coding/paas/v4",
          notes: ["saved"],
        }));
      }

      return new Response(JSON.stringify(state));
    }) as typeof fetch;

    render(<AiModelsPanel initialState={state} />);

    await user.clear(screen.getByLabelText(/default model/i));
    await user.type(screen.getByLabelText(/default model/i), "glm-5.1");
    await user.clear(screen.getByLabelText(/^provider$/i));
    await user.type(screen.getByLabelText(/^provider$/i), "zai");
    await user.clear(screen.getByLabelText(/base url/i));
    await user.type(screen.getByLabelText(/base url/i), "https://api.z.ai/api/coding/paas/v4");
    await user.click(screen.getByRole("button", { name: /save hermes config/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/settings/hermes", expect.objectContaining({
        method: "PUT",
      }));
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("glm-5.1")).toBeInTheDocument();
      expect(screen.getByText("saved")).toBeInTheDocument();
    });
  });
});
