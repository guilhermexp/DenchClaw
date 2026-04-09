import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { resolveOpenClawStateDir } from "@/lib/workspace";
import {
  refreshIntegrationsRuntime,
  readOpenClawConfigForIntegrations,
  writeOpenClawConfigForIntegrations,
  type IntegrationRuntimeRefresh,
} from "./integrations";

const execFileAsync = promisify(execFile);

type UnknownRecord = Record<string, unknown>;

export type AiModelProviderId =
  | "anthropic"
  | "google"
  | "nvidia"
  | "ollama"
  | "openai"
  | "openai-codex"
  | "openrouter"
  | "venice"
  | "xai"
  | "zai"
  | "minimax"
  | "moonshot"
  | "kimi-coding";

export type AiModelProviderInfo = {
  id: AiModelProviderId;
  name: string;
  description: string;
  authType: "api_key" | "setup_token" | "oauth" | "ollama";
  recommended?: boolean;
  popular?: boolean;
  privacyFirst?: boolean;
  localModels?: boolean;
  placeholder?: string;
  helpUrl?: string;
  helpText?: string;
};

export type AiModelEntry = {
  key: string;
  provider: string;
  providerId: AiModelProviderId | null;
  modelId: string;
  name: string;
  input: string;
  contextWindow: number | null;
  available: boolean;
  local: boolean;
  missing: boolean;
};

export type AiModelsPageState = {
  providers: Array<AiModelProviderInfo & { configured: boolean; modelCount: number }>;
  models: AiModelEntry[];
  selectedProvider: AiModelProviderId | null;
  primaryModel: string | null;
  warning: string | null;
};

export type AiModelsUpdateResult = {
  state: AiModelsPageState;
  changed: boolean;
  refresh: IntegrationRuntimeRefresh;
  error?: string;
};

export type AiModelsRuntimeTestResult = {
  ok: boolean;
  provider: string | null;
  model: string | null;
  text: string | null;
  error: string | null;
};

const PROVIDERS: AiModelProviderInfo[] = [
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    description: "Best for complex reasoning, long-form writing and precise instructions",
    authType: "setup_token",
    recommended: true,
    placeholder: "sk-ant-...",
    helpUrl: "https://console.anthropic.com/settings/keys",
    helpText: "Get your API key from the Anthropic Console.",
  },
  {
    id: "moonshot",
    name: "Moonshot (Kimi)",
    description: "Kimi K2.5 with 256K context window for complex reasoning and coding",
    authType: "api_key",
    popular: true,
    placeholder: "sk-...",
    helpUrl: "https://platform.moonshot.cn/console/api-keys",
    helpText: "Get your API key from the Moonshot AI Platform.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "One gateway to 200+ AI models. Ideal for flexibility and experimentation",
    authType: "api_key",
    popular: true,
    placeholder: "sk-or-...",
    helpUrl: "https://openrouter.ai/keys",
    helpText: "Get your API key from OpenRouter.",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    description: "Access DeepSeek, Kimi, etc. via NVIDIA's free API",
    authType: "api_key",
    popular: true,
    placeholder: "nvapi-...",
    helpUrl: "https://build.nvidia.com/explore/discover",
    helpText: "Get your free API key from NVIDIA Build.",
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Run AI models locally or use Ollama Cloud for remote inference",
    authType: "ollama",
    localModels: true,
    placeholder: "ollama-api-key...",
    helpUrl: "https://ollama.com",
    helpText: "Run models locally or sign in to Ollama Cloud.",
  },
  {
    id: "openai",
    name: "OpenAI (API Key)",
    description: "Use your API key for chat, coding and everyday tasks",
    authType: "api_key",
    placeholder: "sk-...",
    helpUrl: "https://platform.openai.com/api-keys",
    helpText: "Get your API key from the OpenAI Platform.",
  },
  {
    id: "openai-codex",
    name: "ChatGPT (Subscription)",
    description: "Use your ChatGPT subscription to access AI Agent",
    authType: "oauth",
    helpUrl: "https://openai.com/codex/",
    helpText: "Automatically connect to your ChatGPT account and use the AI Agent at no extra cost.",
  },
  {
    id: "google",
    name: "Google (Gemini)",
    description: "Strong with images, documents and large amounts of context",
    authType: "api_key",
    placeholder: "AIza...",
    helpUrl: "https://aistudio.google.com/apikey",
    helpText: "Get your API key from Google AI Studio.",
  },
  {
    id: "venice",
    name: "Venice AI",
    description: "Privacy-focused AI with uncensored models",
    authType: "api_key",
    privacyFirst: true,
    placeholder: "ven_...",
    helpUrl: "https://venice.ai/settings/api",
    helpText: "Get your API key from Venice AI Settings.",
  },
  {
    id: "xai",
    name: "xAI",
    description: "High-performance reasoning model by xAI with web search capabilities",
    authType: "api_key",
    placeholder: "xai-***",
    helpUrl: "https://console.x.ai/",
    helpText: "Get your API key from the xAI Console.",
  },
  {
    id: "zai",
    name: "Z.ai (GLM)",
    description: "Cost-effective models for everyday tasks and high-volume usage",
    authType: "api_key",
    placeholder: "sk-...",
    helpUrl: "https://z.ai/manage-apikey/apikey-list",
    helpText: "Get your API key from the Z.AI Platform.",
  },
  {
    id: "minimax",
    name: "MiniMax",
    description: "Good for creative writing and expressive conversations",
    authType: "api_key",
    placeholder: "sk-...",
    helpUrl: "https://platform.minimax.io/user-center/basic-information/interface-key",
    helpText: "Get your API key from the MiniMax Platform.",
  },
  {
    id: "kimi-coding",
    name: "Kimi Coding",
    description: "Dedicated coding endpoint with Kimi K2.5 optimized for development tasks",
    authType: "api_key",
    placeholder: "sk-...",
    helpUrl: "https://www.kimi.com/code/en",
    helpText: "Get your API key from the Kimi Coding Platform.",
  },
];

const PROVIDER_IDS = new Set(PROVIDERS.map((provider) => provider.id));

const ENV_VARS_BY_PROVIDER: Record<AiModelProviderId, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  nvidia: ["NVIDIA_API_KEY", "NVIDIA_NIM_API_KEY"],
  ollama: ["OLLAMA_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  "openai-codex": [],
  openrouter: ["OPENROUTER_API_KEY"],
  venice: ["VENICE_API_KEY"],
  xai: ["XAI_API_KEY"],
  zai: ["ZAI_API_KEY", "GLM_API_KEY"],
  minimax: ["MINIMAX_API_KEY"],
  moonshot: ["MOONSHOT_API_KEY"],
  "kimi-coding": ["KIMI_CODING_API_KEY"],
};

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function ensureRecord(parent: UnknownRecord, key: string): UnknownRecord {
  const existing = asRecord(parent[key]);
  if (existing) {
    return existing;
  }
  const next: UnknownRecord = {};
  parent[key] = next;
  return next;
}

function writeSanitizedTempConfig(): { path: string; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), "dench-ai-models-"));
  const tempConfigPath = join(tempDir, "openclaw.json");
  const tempConfig = asRecord(JSON.parse(readFileSync(join(resolveOpenClawStateDir(), "openclaw.json"), "utf-8"))) ?? {};
  delete tempConfig.composio;
  delete tempConfig.plugins;
  writeFileSync(tempConfigPath, `${JSON.stringify(tempConfig, null, 2)}\n`, "utf-8");
  return {
    path: tempConfigPath,
    cleanup: () => rmSync(tempDir, { force: true, recursive: true }),
  };
}

function authProfilesPath(): string {
  return join(resolveOpenClawStateDir(), "agents", "main", "agent", "auth-profiles.json");
}

function readAuthProfiles(): { version: number; profiles: Record<string, unknown>; order: Record<string, string[]> } {
  const filePath = authProfilesPath();
  if (!existsSync(filePath)) {
    return { version: 1, profiles: {}, order: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as UnknownRecord;
    return {
      version: typeof parsed.version === "number" ? parsed.version : 1,
      profiles: asRecord(parsed.profiles) ?? {},
      order: Object.fromEntries(
        Object.entries(asRecord(parsed.order) ?? {}).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [],
        ]),
      ),
    };
  } catch {
    return { version: 1, profiles: {}, order: {} };
  }
}

function writeAuthProfiles(store: { version: number; profiles: Record<string, unknown>; order: Record<string, string[]> }) {
  const filePath = authProfilesPath();
  mkdirSync(join(resolveOpenClawStateDir(), "agents", "main", "agent"), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
}

function hasEnvCredential(providerId: AiModelProviderId): boolean {
  return ENV_VARS_BY_PROVIDER[providerId].some((envVar) => {
    const value = process.env[envVar];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function isConfiguredFromConfig(config: UnknownRecord, providerId: AiModelProviderId): boolean {
  const models = asRecord(config.models);
  const providers = asRecord(models?.providers);
  const provider = asRecord(providers?.[providerId]);
  if (!provider) {
    return false;
  }
  return Boolean(readString(provider.apiKey) || provider.apiKey || readString(provider.baseUrl));
}

function isConfiguredFromAuthProfiles(providerId: AiModelProviderId, store: { profiles: Record<string, unknown> }): boolean {
  return Object.values(store.profiles).some((profile) => {
    const record = asRecord(profile);
    if (!record) {
      return false;
    }
    return readString(record.provider) === providerId
      && (Boolean(readString(record.key)) || Boolean(readString(record.token)));
  });
}

function isProviderConfigured(config: UnknownRecord, providerId: AiModelProviderId, authStore: { profiles: Record<string, unknown> }): boolean {
  return isConfiguredFromConfig(config, providerId)
    || isConfiguredFromAuthProfiles(providerId, authStore)
    || hasEnvCredential(providerId);
}

function resolveProviderIdFromModelKey(modelKey: string): AiModelProviderId | null {
  const providerPrefix = modelKey.split("/", 1)[0]?.trim().toLowerCase();
  if (!providerPrefix) {
    return null;
  }
  if (PROVIDER_IDS.has(providerPrefix as AiModelProviderId)) {
    return providerPrefix as AiModelProviderId;
  }
  return null;
}

async function readModelCatalog(): Promise<AiModelEntry[]> {
  const temp = writeSanitizedTempConfig();

  try {
    const { stdout } = await execFileAsync("openclaw", ["--profile", "dench", "models", "list", "--all", "--json"], {
      cwd: process.cwd(),
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        OPENCLAW_CONFIG_PATH: temp.path,
      },
    });
    const payload = JSON.parse(stdout) as {
      models?: Array<{
        key?: string;
        name?: string;
        input?: string;
        contextWindow?: number;
        local?: boolean;
        available?: boolean;
        missing?: boolean;
      }>;
    };
    const models = Array.isArray(payload.models) ? payload.models : [];
    return models
      .map((model) => {
        const key = readString(model.key);
        if (!key || !key.includes("/")) {
          return null;
        }
        const providerId = resolveProviderIdFromModelKey(key);
        const provider = key.split("/", 1)[0] ?? "";
        const modelId = key.slice(provider.length + 1);
        return {
          key,
          provider,
          providerId,
          modelId,
          name: readString(model.name) ?? modelId,
          input: readString(model.input) ?? "text",
          contextWindow: readNumber(model.contextWindow),
          available: model.available === true,
          local: model.local === true,
          missing: model.missing === true,
        } satisfies AiModelEntry;
      })
      .filter((model): model is AiModelEntry => Boolean(model))
      .filter((model) => model.providerId !== null);
  } finally {
    temp.cleanup();
  }
}

export async function testAiModelsRuntime(): Promise<AiModelsRuntimeTestResult> {
  const temp = writeSanitizedTempConfig();
  try {
    const { stdout } = await execFileAsync(
      "openclaw",
      ["--profile", "dench", "agent", "--agent", "main", "--json", "-m", "Reply with exactly: pong", "--timeout", "45"],
      {
        cwd: process.cwd(),
        maxBuffer: 16 * 1024 * 1024,
        env: {
          ...process.env,
          OPENCLAW_CONFIG_PATH: temp.path,
        },
      },
    );
    const payload = JSON.parse(stdout) as {
      result?: {
        payloads?: Array<{ text?: string | null }>;
        meta?: {
          agentMeta?: {
            provider?: string | null;
            model?: string | null;
          };
        };
      };
    };
    return {
      ok: true,
      provider: readString(payload.result?.meta?.agentMeta?.provider) ?? null,
      model: readString(payload.result?.meta?.agentMeta?.model) ?? null,
      text: readString(payload.result?.payloads?.[0]?.text) ?? null,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      provider: null,
      model: null,
      text: null,
      error: error instanceof Error ? error.message : "Runtime test failed.",
    };
  } finally {
    temp.cleanup();
  }
}

function readPrimaryModel(config: UnknownRecord): string | null {
  const agents = asRecord(config.agents);
  const defaults = asRecord(agents?.defaults);
  const model = defaults?.model;
  if (typeof model === "string") {
    return model.trim() || null;
  }
  return readString(asRecord(model)?.primary);
}

function syncConfigAuthMetadata(
  config: UnknownRecord,
  params: { providerId: AiModelProviderId; profileId: string; mode: "api_key" | "token" },
): void {
  const auth = ensureRecord(config, "auth");
  const profiles = ensureRecord(auth, "profiles");
  profiles[params.profileId] = {
    provider: params.providerId,
    mode: params.mode,
  };
  const order = ensureRecord(auth, "order");
  order[params.providerId] = [params.profileId];
}

function writeApiProviderCredential(params: {
  providerId: AiModelProviderId;
  secret: string;
  type: "api_key" | "token";
}) {
  const authStore = readAuthProfiles();
  const profileId = `${params.providerId}:default`;
  authStore.profiles[profileId] = params.type === "token"
    ? { type: "token", provider: params.providerId, token: params.secret }
    : { type: "api_key", provider: params.providerId, key: params.secret };
  authStore.order[params.providerId] = [profileId];
  writeAuthProfiles(authStore);

  const config = readOpenClawConfigForIntegrations();
  syncConfigAuthMetadata(config, {
    providerId: params.providerId,
    profileId,
    mode: params.type,
  });
  writeOpenClawConfigForIntegrations(config);
}

function configureOllama(params: { baseUrl: string; apiKey: string }) {
  const config = readOpenClawConfigForIntegrations();
  const models = ensureRecord(config, "models");
  models.mode = "merge";
  const providers = ensureRecord(models, "providers");
  providers.ollama = {
    baseUrl: params.baseUrl,
    api: "ollama",
    apiKey: params.apiKey,
    models: [],
  };
  syncConfigAuthMetadata(config, {
    providerId: "ollama",
    profileId: "ollama:default",
    mode: "api_key",
  });
  writeOpenClawConfigForIntegrations(config);

  const authStore = readAuthProfiles();
  authStore.profiles["ollama:default"] = {
    type: "api_key",
    provider: "ollama",
    key: params.apiKey,
  };
  authStore.order.ollama = ["ollama:default"];
  writeAuthProfiles(authStore);
}

function savePrimaryModel(modelKey: string) {
  const config = readOpenClawConfigForIntegrations();
  const agents = ensureRecord(config, "agents");
  const defaults = ensureRecord(agents, "defaults");
  const model = ensureRecord(defaults, "model");
  model.primary = modelKey;
  const allowlist = ensureRecord(defaults, "models");
  if (!asRecord(allowlist[modelKey])) {
    allowlist[modelKey] = {};
  }
  writeOpenClawConfigForIntegrations(config);
}

export async function getAiModelsState(params?: { provider?: string | null }): Promise<AiModelsPageState> {
  const config = readOpenClawConfigForIntegrations();
  const authStore = readAuthProfiles();
  let models: AiModelEntry[] = [];
  let warning: string | null = null;
  try {
    models = await Promise.race([
      readModelCatalog(),
      new Promise<AiModelEntry[]>((_, reject) => {
        setTimeout(() => reject(new Error("Timed out loading OpenClaw model catalog.")), 8000);
      }),
    ]);
  } catch (error) {
    warning = error instanceof Error
      ? `OpenClaw catalog indisponivel no momento. Detalhe: ${error.message}`
      : "OpenClaw catalog indisponivel no momento.";
  }
  const providerMap = new Map<AiModelProviderId, number>();
  for (const model of models) {
    if (!model.providerId) {
      continue;
    }
    providerMap.set(model.providerId, (providerMap.get(model.providerId) ?? 0) + 1);
  }
  const requestedProvider = typeof params?.provider === "string" && PROVIDER_IDS.has(params.provider as AiModelProviderId)
    ? (params.provider as AiModelProviderId)
    : null;
  const primaryModel = readPrimaryModel(config);
  const inferredProvider = primaryModel ? resolveProviderIdFromModelKey(primaryModel) : null;
  return {
    providers: PROVIDERS.map((provider) => ({
      ...provider,
      configured: isProviderConfigured(config, provider.id, authStore),
      modelCount: providerMap.get(provider.id) ?? 0,
    })),
    models,
    selectedProvider: requestedProvider ?? inferredProvider,
    primaryModel,
    warning,
  };
}

export async function saveProviderCredential(params: {
  providerId: AiModelProviderId;
  secret: string;
  authType?: "api_key" | "token";
}): Promise<AiModelsUpdateResult> {
  writeApiProviderCredential({
    providerId: params.providerId,
    secret: params.secret,
    type: params.authType === "token" ? "token" : "api_key",
  });
  const refresh = await refreshIntegrationsRuntime();
  return {
    state: await getAiModelsState({ provider: params.providerId }),
    changed: true,
    refresh,
  };
}

export async function saveOllamaProvider(params: {
  baseUrl: string;
  apiKey: string;
}): Promise<AiModelsUpdateResult> {
  configureOllama(params);
  const refresh = await refreshIntegrationsRuntime();
  return {
    state: await getAiModelsState({ provider: "ollama" }),
    changed: true,
    refresh,
  };
}

export async function selectPrimaryModel(modelKey: string): Promise<AiModelsUpdateResult> {
  savePrimaryModel(modelKey);
  const refresh = await refreshIntegrationsRuntime();
  const providerId = resolveProviderIdFromModelKey(modelKey);
  return {
    state: await getAiModelsState({ provider: providerId }),
    changed: true,
    refresh,
  };
}

export { PROVIDERS as AI_MODEL_PROVIDERS };
