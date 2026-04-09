import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";

const { setComposioApiKeyMock, validateComposioApiKeyMock } = vi.hoisted(() => ({
  setComposioApiKeyMock: vi.fn(),
  validateComposioApiKeyMock: vi.fn(),
}));

vi.mock("@/lib/composio", () => ({
  isComposioGatewayAuthError: vi.fn((error: unknown) =>
    error instanceof Error && /HTTP (401|403)\b/.test(error.message),
  ),
  setComposioApiKey: setComposioApiKeyMock,
  validateComposioApiKey: validateComposioApiKeyMock,
}));

vi.mock("@/lib/integrations", () => ({
  normalizeLockedDenchIntegrations: vi.fn(() => ({
    changed: false,
    state: {
      denchCloud: {
        hasKey: true,
        isPrimaryProvider: true,
        primaryModel: "dench-cloud/claude-sonnet-4.6",
      },
      composio: {
        hasApiKey: true,
        hasDedicatedApiKey: true,
        apiKeySource: "composio_config",
      },
      metadata: { schemaVersion: 1, exa: { ownsSearch: true, fallbackProvider: "duckduckgo" } },
      search: {
        builtIn: {
          enabled: false,
          denied: true,
          provider: "duckduckgo",
        },
        effectiveOwner: "exa",
      },
      integrations: [
        {
          id: "exa",
          label: "Exa Search",
          enabled: true,
          available: true,
          locked: false,
          lockReason: null,
          lockBadge: null,
          gatewayBaseUrl: "https://gateway.merseoriginals.com",
          auth: { configured: true, source: "config" },
          plugin: null,
          managedByDench: true,
          healthIssues: [],
        },
      ],
    },
  })),
}));

describe("integrations API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateComposioApiKeyMock.mockResolvedValue(undefined);
    setComposioApiKeyMock.mockReturnValue({
      hasApiKey: true,
      hasDedicatedApiKey: true,
      apiKeySource: "composio_config",
    });
  });

  it("returns normalized integrations state", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.search.effectiveOwner).toBe("exa");
    expect(json.metadata.exa.fallbackProvider).toBe("duckduckgo");
    expect(json.integrations[0].id).toBe("exa");
    expect(json.composio).toEqual({
      hasApiKey: true,
      hasDedicatedApiKey: true,
      apiKeySource: "composio_config",
    });
  });

  it("persists a dedicated Composio API key", async () => {
    const response = await POST(new Request("http://localhost/api/integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ composioApiKey: "composio-key" }),
    }));

    expect(response.status).toBe(200);
    expect(setComposioApiKeyMock).toHaveBeenCalledWith("composio-key");
    expect(await response.json()).toEqual({
      composio: {
        hasApiKey: true,
        hasDedicatedApiKey: true,
        apiKeySource: "composio_config",
      },
    });
  });

  it("rejects invalid Composio API keys before persisting them", async () => {
    validateComposioApiKeyMock.mockRejectedValue(
      new Error("Failed to fetch toolkits (HTTP 401)"),
    );

    const response = await POST(new Request("http://localhost/api/integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ composioApiKey: "bad-key" }),
    }));

    expect(response.status).toBe(401);
    expect(setComposioApiKeyMock).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      error: "Composio API key rejected by gateway. Update it and try again.",
      code: "invalid_api_key",
    });
  });
});
