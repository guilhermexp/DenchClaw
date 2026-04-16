/**
 * Hermes API Client — OpenAI-compatible HTTP client for the Hermes agent runtime.
 *
 * The DenchClaw dashboard uses this instead of the OpenClaw gateway WebSocket.
 * Hermes exposes an OpenAI-compatible REST API with SSE streaming support.
 */

export type HermesClientConfig = {
  baseUrl: string;
  apiKey?: string;
};

// ── Request/Response Types ──────────────────────────────────────────────────

export type HermesMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  tool_call_id?: string;
};

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type HermesToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type HermesChatRequest = {
  messages: HermesMessage[];
  model?: string;
  stream?: boolean;
  tools?: HermesToolDefinition[];
  temperature?: number;
  max_tokens?: number;
};

export type HermesChatChoice = {
  index: number;
  message: {
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason: string;
};

export type HermesChatResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: HermesChatChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type HermesStreamDelta = {
  role?: string;
  content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
};

export type HermesStreamChoice = {
  index: number;
  delta: HermesStreamDelta;
  finish_reason: string | null;
};

export type HermesStreamChunk = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: HermesStreamChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type HermesModel = {
  id: string;
  name?: string;
  object: string;
  created?: number;
  owned_by?: string;
};

// ── URL Resolution ──────────────────────────────────────────────────────────

const DEFAULT_HERMES_DEV_PORT = 21321;
const DEFAULT_HERMES_PROD_PORT = 21322;

/**
 * Resolve the base URL for the Hermes API.
 * Priority:
 *   1. HERMES_API_URL env var (full URL)
 *   2. HERMES_PORT env var (port only, host = localhost)
 *   3. Default: localhost:21321 (dev) or 21322 (prod)
 */
export function resolveHermesBaseUrl(): string {
  const envUrl = process.env.HERMES_API_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");

  const envPort = process.env.HERMES_PORT?.trim();
  if (envPort) {
    const port = parseInt(envPort, 10);
    if (Number.isFinite(port)) return `http://localhost:${port}`;
  }

  // Default: try dev port first, fall back to prod
  return `http://localhost:${DEFAULT_HERMES_DEV_PORT}`;
}

// ── Client Class ────────────────────────────────────────────────────────────

export class HermesClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config?: Partial<HermesClientConfig>) {
    this.baseUrl = config?.baseUrl ?? resolveHermesBaseUrl();
    this.apiKey = config?.apiKey ?? process.env.HERMES_API_KEY;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.apiKey) {
      h["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  /**
   * Non-streaming chat completion.
   */
  async chat(request: HermesChatRequest): Promise<HermesChatResponse> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ ...request, stream: false }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Hermes chat error ${res.status}: ${body}`);
    }
    return (await res.json()) as HermesChatResponse;
  }

  /**
   * Streaming chat completion. Yields SSE chunks in OpenAI format.
   */
  async *chatStream(request: HermesChatRequest): AsyncGenerator<HermesStreamChunk> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ ...request, stream: true }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Hermes stream error ${res.status}: ${body}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Hermes response has no body");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === "data: [DONE]") return;
          if (trimmed.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              yield parsed as HermesStreamChunk;
            } catch {
              // Skip malformed SSE lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * List available models.
   */
  async listModels(): Promise<HermesModel[]> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers: this.headers(),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: HermesModel[] };
      return data.data ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Health check — returns true if Hermes is reachable.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────

let _client: HermesClient | null = null;

export function getHermesClient(): HermesClient {
  if (!_client) {
    _client = new HermesClient();
  }
  return _client;
}

export function resetHermesClient(): void {
  _client = null;
}
