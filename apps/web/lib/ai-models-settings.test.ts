import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getAiModelsState, updateAiModelsState } from "./ai-models-settings";

describe("ai-models-settings editable Hermes config", () => {
  let tempHome: string | null = null;

  afterEach(() => {
    if (tempHome) {
      rmSync(tempHome, { recursive: true, force: true });
      tempHome = null;
    }
    delete process.env.HERMES_HOME;
  });

  it("updates the active Hermes model settings and named providers while preserving unrelated config", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "hermes-config-"));
    process.env.HERMES_HOME = tempHome;

    writeFileSync(join(tempHome, "config.yaml"), [
      "model:",
      "  default: old-model",
      "  provider: old-provider",
      "  base_url: https://old.example",
      "providers:",
      "  old-provider:",
      "    base_url: https://old-provider.example",
      "fallback_providers: [old-provider]",
      "toolsets: [terminal]",
      "display:",
      "  personality: kawaii",
      "",
    ].join("\n"), "utf-8");

    await updateAiModelsState({
      defaultModel: "new-model",
      provider: "new-provider",
      baseUrl: "https://new.example",
      fallbackProviders: ["backup-a", "backup-b"],
      toolsets: ["terminal", "file", "web"],
      providersYaml: [
        "new-provider:",
        "  base_url: https://kimi.example/v1",
        "  api: anthropic-messages",
      ].join("\n"),
    });

    const state = await getAiModelsState();

    expect(state.defaultModel).toBe("new-model");
    expect(state.provider).toBe("new-provider");
    expect(state.baseUrl).toBe("https://new.example");
    expect(state.fallbackProviders).toEqual(["backup-a", "backup-b"]);
    expect(state.toolsets).toEqual(["terminal", "file", "web"]);
    expect(state.configuredProviders).toEqual([
      {
        id: "new-provider",
        baseUrl: "https://kimi.example/v1",
        keys: ["base_url", "api"],
      },
    ]);
    expect(state.notes).toContain("Hermes config editing is enabled from this UI.");

    const written = await import("node:fs").then((fs) => fs.readFileSync(join(tempHome!, "config.yaml"), "utf-8"));
    expect(written).toContain("personality: kawaii");
  });

  it("rejects invalid providers YAML", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "hermes-config-"));
    process.env.HERMES_HOME = tempHome;
    writeFileSync(join(tempHome, "config.yaml"), "providers: {}\n", "utf-8");

    await expect(updateAiModelsState({
      defaultModel: "gpt-5.4",
      provider: "openai-codex",
      baseUrl: "https://chatgpt.com/backend-api/codex/",
      fallbackProviders: [],
      toolsets: ["terminal"],
      providersYaml: "[not-an-object]",
    })).rejects.toThrow(/providers yaml/i);
  });
});
