import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";

export type HermesProviderSummary = {
  id: string;
  baseUrl: string | null;
  keys: string[];
};

export type AiModelsPageState = {
  sectionLabel: string;
  cliAvailable: boolean;
  cliPath: string | null;
  cliVersion: string | null;
  acpAvailable: boolean;
  hermesHome: string;
  configPath: string;
  envPath: string;
  configExists: boolean;
  defaultModel: string | null;
  provider: string | null;
  baseUrl: string | null;
  toolsets: string[];
  fallbackProviders: string[];
  configuredProviders: HermesProviderSummary[];
  providersYaml: string;
  notes: string[];
};

export type UpdateAiModelsInput = {
  defaultModel: string;
  provider: string;
  baseUrl: string;
  toolsets: string[];
  fallbackProviders: string[];
  providersYaml: string;
};

type HermesModelConfig = {
  default?: string;
  provider?: string;
  base_url?: string;
};

type HermesYamlConfig = {
  model?: string | HermesModelConfig;
  provider?: string;
  base_url?: string;
  providers?: Record<string, unknown>;
  fallback_providers?: unknown[];
  toolsets?: unknown[];
  [key: string]: unknown;
};

function readHermesHome(): string {
  return process.env.HERMES_HOME?.trim() || join(homedir(), ".hermes");
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requireString(value: string, field: string): string {
  const next = value.trim();
  if (!next) {
    throw new Error(`${field} is required.`);
  }
  return next;
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => safeString(item))
    .filter((item): item is string => Boolean(item));
}

function readConfig(configPath: string): HermesYamlConfig | null {
  if (!existsSync(configPath)) return null;
  try {
    return YAML.parse(readFileSync(configPath, "utf-8")) as HermesYamlConfig;
  } catch {
    return null;
  }
}

function readCommandOutput(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim() || null;
  } catch {
    return null;
  }
}

function resolveCliPath(): string | null {
  const locator = process.platform === "win32" ? "where" : "which";
  const output = readCommandOutput(locator, ["hermes"]);
  return output?.split(/\r?\n/)[0]?.trim() || null;
}

function normalizeProviders(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function resolveConfiguredProviders(config: HermesYamlConfig | null): HermesProviderSummary[] {
  const providers = normalizeProviders(config?.providers);

  return Object.entries(providers)
    .map(([id, raw]) => {
      const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      return {
        id,
        baseUrl: safeString(record.base_url) ?? safeString(record.baseUrl),
        keys: Object.keys(record),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function resolveDefaultModel(config: HermesYamlConfig | null): string | null {
  if (!config?.model) return null;
  if (typeof config.model === "string") return safeString(config.model);
  return safeString(config.model.default);
}

function resolveProvider(config: HermesYamlConfig | null): string | null {
  if (!config?.model) return safeString(config?.provider);
  if (typeof config.model === "string") return safeString(config?.provider);
  return safeString(config.model.provider) ?? safeString(config.provider);
}

function resolveBaseUrl(config: HermesYamlConfig | null): string | null {
  if (!config?.model) return safeString(config?.base_url);
  if (typeof config.model === "string") return safeString(config?.base_url);
  return safeString(config.model.base_url) ?? safeString(config.base_url);
}

function resolveProvidersYaml(config: HermesYamlConfig | null): string {
  const providers = normalizeProviders(config?.providers);
  return YAML.stringify(providers).trim() || "{}";
}

function parseProvidersYaml(providersYaml: string): Record<string, unknown> {
  const trimmed = providersYaml.trim();
  if (!trimmed) return {};

  try {
    const parsed = YAML.parse(trimmed);
    if (!parsed) return {};
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Providers YAML must parse to an object map.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(error instanceof Error ? `Invalid providers YAML: ${error.message}` : "Invalid providers YAML.");
  }
}

function buildNotes(configExists: boolean, envPath: string, defaultModel: string | null, provider: string | null, cliPath: string | null): string[] {
  const notes: string[] = [];
  if (!cliPath) notes.push("Hermes CLI não encontrado no PATH.");
  if (!configExists) notes.push("Arquivo ~/.hermes/config.yaml não encontrado.");
  if (configExists && !defaultModel) notes.push("Nenhum model.default configurado no Hermes.");
  if (configExists && !provider) notes.push("Nenhum provider padrão configurado no Hermes.");
  if (existsSync(envPath)) notes.push("Arquivo ~/.hermes/.env detectado para credenciais adicionais.");
  notes.push("Hermes config editing is enabled from this UI.");
  notes.push("Esta seção lê e atualiza a configuração real do Hermes; não remove nem migra arquivos legados do workspace.");
  return notes;
}

function buildState(config: HermesYamlConfig | null): AiModelsPageState {
  const hermesHome = readHermesHome();
  const configPath = join(hermesHome, "config.yaml");
  const envPath = join(hermesHome, ".env");
  const configExists = existsSync(configPath);
  const cliPath = resolveCliPath();
  const cliVersion = cliPath ? readCommandOutput("hermes", ["--version"]) : null;
  const acpHelp = cliPath ? readCommandOutput("hermes", ["acp", "--help"]) : null;
  const configuredProviders = resolveConfiguredProviders(config);
  const defaultModel = resolveDefaultModel(config);
  const provider = resolveProvider(config);
  const baseUrl = resolveBaseUrl(config);
  const fallbackProviders = safeStringArray(config?.fallback_providers);
  const toolsets = safeStringArray(config?.toolsets);

  return {
    sectionLabel: "Hermes",
    cliAvailable: Boolean(cliPath),
    cliPath,
    cliVersion,
    acpAvailable: Boolean(acpHelp && acpHelp.includes("Start Hermes Agent in ACP mode")),
    hermesHome,
    configPath,
    envPath,
    configExists,
    defaultModel,
    provider,
    baseUrl,
    toolsets,
    fallbackProviders,
    configuredProviders,
    providersYaml: resolveProvidersYaml(config),
    notes: buildNotes(configExists, envPath, defaultModel, provider, cliPath),
  };
}

export async function getAiModelsState(): Promise<AiModelsPageState> {
  const hermesHome = readHermesHome();
  const configPath = join(hermesHome, "config.yaml");
  return buildState(readConfig(configPath));
}

export async function updateAiModelsState(input: UpdateAiModelsInput): Promise<AiModelsPageState> {
  const hermesHome = readHermesHome();
  const configPath = join(hermesHome, "config.yaml");
  const current = readConfig(configPath) ?? {};
  const providers = parseProvidersYaml(input.providersYaml);

  const next: HermesYamlConfig = {
    ...current,
    model: {
      ...(typeof current.model === "object" && current.model ? current.model : {}),
      default: requireString(input.defaultModel, "Default model"),
      provider: requireString(input.provider, "Provider"),
      base_url: input.baseUrl.trim(),
    },
    provider: requireString(input.provider, "Provider"),
    base_url: input.baseUrl.trim(),
    providers,
    fallback_providers: input.fallbackProviders,
    toolsets: input.toolsets,
  };

  mkdirSync(hermesHome, { recursive: true });
  writeFileSync(configPath, YAML.stringify(next), "utf-8");

  return buildState(next);
}
