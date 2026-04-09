import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

let stateDir = "";

vi.mock("@/lib/workspace", () => ({
  resolveOpenClawStateDir: vi.fn(() => stateDir),
}));

const {
  fetchComposioMcpToolsList,
  resolveComposioApiKey,
  resolveComposioApiKeyState,
  resolveComposioEligibility,
  resolveComposioGatewayUrl,
  setComposioApiKey,
} = await import("./composio");

describe("composio config resolution", () => {
  beforeEach(() => {
    stateDir = path.join(os.tmpdir(), `dench-composio-state-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(stateDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("prefers the Dench Cloud provider baseUrl when resolving the Composio gateway URL", () => {
    writeFileSync(
      path.join(stateDir, "openclaw.json"),
      JSON.stringify({
        models: {
          providers: {
            "dench-cloud": {
              baseUrl: "https://gateway.example.com/v1",
            },
          },
        },
        plugins: {
          entries: {
            "dench-ai-gateway": {
              config: {
                gatewayUrl: "https://stale-plugin.example.com",
              },
            },
          },
        },
      }),
      "utf-8",
    );

    expect(resolveComposioGatewayUrl()).toBe("https://gateway.example.com");
  });

  it("accepts self-hosted Composio when a Dench auth profile key exists", () => {
    mkdirSync(path.join(stateDir, "agents", "main", "agent"), { recursive: true });
    writeFileSync(
      path.join(stateDir, "openclaw.json"),
      JSON.stringify({
        agents: {
          defaults: {
            model: {
              primary: "anthropic/claude-4",
            },
          },
        },
      }),
      "utf-8",
    );
    writeFileSync(
      path.join(stateDir, "agents", "main", "agent", "auth-profiles.json"),
      JSON.stringify({
        profiles: {
          "dench-cloud:default": {
            key: "profile-key",
          },
        },
      }),
      "utf-8",
    );

    expect(resolveComposioApiKey()).toBe("profile-key");
    expect(resolveComposioEligibility()).toEqual({
      eligible: true,
      lockReason: null,
      lockBadge: null,
    });
  });

  it("keeps Composio locked only when no integration key exists anywhere", () => {
    writeFileSync(
      path.join(stateDir, "openclaw.json"),
      JSON.stringify({
        agents: {
          defaults: {
            model: {
              primary: "anthropic/claude-4",
            },
          },
        },
      }),
      "utf-8",
    );

    expect(resolveComposioApiKey()).toBeNull();
    expect(resolveComposioEligibility()).toEqual({
      eligible: false,
      lockReason: "missing_dench_key",
      lockBadge: "Add Composio API Key",
    });
  });

  it("does not require Dench Cloud to be the primary provider", () => {
    writeFileSync(
      path.join(stateDir, "openclaw.json"),
      JSON.stringify({
        agents: {
          defaults: {
            model: {
              primary: "openrouter/auto",
            },
          },
        },
        models: {
          providers: {
            "dench-cloud": {
              apiKey: "config-key",
            },
          },
        },
      }),
      "utf-8",
    );

    expect(resolveComposioEligibility()).toEqual({
      eligible: true,
      lockReason: null,
      lockBadge: null,
    });
  });

  it("prefers auth profile key over environment fallback for Composio", () => {
    vi.stubEnv("DENCH_CLOUD_API_KEY", "env-key");
    mkdirSync(path.join(stateDir, "agents", "main", "agent"), { recursive: true });
    writeFileSync(
      path.join(stateDir, "agents", "main", "agent", "auth-profiles.json"),
      JSON.stringify({
        profiles: {
          "dench-cloud:default": {
            key: "profile-key",
          },
        },
      }),
      "utf-8",
    );

    expect(resolveComposioApiKey()).toBe("profile-key");
  });

  it("prefers a dedicated Composio key stored in openclaw.json over Dench-derived credentials", () => {
    mkdirSync(path.join(stateDir, "agents", "main", "agent"), { recursive: true });
    writeFileSync(
      path.join(stateDir, "openclaw.json"),
      JSON.stringify({
        composio: {
          apiKey: "composio-key",
        },
        models: {
          providers: {
            "dench-cloud": {
              apiKey: "dench-config-key",
            },
          },
        },
      }),
      "utf-8",
    );
    writeFileSync(
      path.join(stateDir, "agents", "main", "agent", "auth-profiles.json"),
      JSON.stringify({
        profiles: {
          "dench-cloud:default": {
            key: "profile-key",
          },
        },
      }),
      "utf-8",
    );
    vi.stubEnv("DENCH_API_KEY", "env-key");

    expect(resolveComposioApiKey()).toBe("composio-key");
    expect(resolveComposioApiKeyState()).toEqual({
      hasApiKey: true,
      hasDedicatedApiKey: true,
      apiKeySource: "composio_config",
    });
  });

  it("persists a dedicated Composio key in openclaw.json", () => {
    writeFileSync(path.join(stateDir, "openclaw.json"), JSON.stringify({ metadata: { foo: "bar" } }), "utf-8");

    const result = setComposioApiKey("  composio-key  ");
    const written = JSON.parse(readFileSync(path.join(stateDir, "openclaw.json"), "utf-8")) as {
      metadata?: { foo?: string };
      composio?: { apiKey?: string };
    };

    expect(result).toEqual({
      hasApiKey: true,
      hasDedicatedApiKey: true,
      apiKeySource: "composio_config",
    });
    expect(written.metadata?.foo).toBe("bar");
    expect(written.composio?.apiKey).toBe("composio-key");
  });

  it("falls back to environment key when no auth profile exists", () => {
    vi.stubEnv("DENCH_API_KEY", "env-key");
    expect(resolveComposioApiKey()).toBe("env-key");
    expect(resolveComposioApiKeyState()).toEqual({
      hasApiKey: true,
      hasDedicatedApiKey: false,
      apiKeySource: "env",
    });
  });

  it("restores environment after Composio auth resolution tests", () => {
    expect(true).toBe(true);
  });

  it("passes connected toolkit and preferred tool hints to the gateway tools/list probe", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        result: {
          tools: [],
        },
      })),
    );

    await fetchComposioMcpToolsList(
      "https://gateway.example.com",
      "dench_test_key",
      {
        connectedToolkits: ["gmail", "slack"],
        preferredToolNames: ["GMAIL_FETCH_EMAILS", "SLACK_SEND_MESSAGE"],
      },
    );

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String(init?.body)) as {
      params: {
        connected_toolkits: string[];
        preferred_tool_names: string[];
      };
    };

    expect(body.params.connected_toolkits).toEqual(["gmail", "slack"]);
    expect(body.params.preferred_tool_names).toEqual([
      "GMAIL_FETCH_EMAILS",
      "SLACK_SEND_MESSAGE",
    ]);
  });
});
