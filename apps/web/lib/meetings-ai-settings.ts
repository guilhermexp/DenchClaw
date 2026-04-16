import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveOpenClawStateDir } from "@/lib/workspace";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readConfigPath(): string {
  return join(resolveOpenClawStateDir(), "openclaw.json");
}

function readConfig(): UnknownRecord {
  const configPath = readConfigPath();
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as UnknownRecord;
  } catch {
    return {};
  }
}

function writeConfig(config: UnknownRecord): void {
  const stateDir = resolveOpenClawStateDir();
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
  writeFileSync(readConfigPath(), JSON.stringify(config, null, 2) + "\n", "utf-8");
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

export type MeetingsAiSettingsState = {
  sectionLabel: string;
  deepgramApiKey: string | null;
  deepgramApiKeySource: "config" | "env" | "missing";
  deepgramModel: string | null;
  openRouterApiKey: string | null;
  openRouterApiKeySource: "config" | "env" | "missing";
  openRouterModel: string | null;
  notes: string[];
};

export type MeetingsAiSettingsUpdate = {
  deepgramApiKey: string;
  deepgramModel: string;
  openRouterApiKey: string;
  openRouterModel: string;
};

function readMeetingsAiConfig(config: UnknownRecord): UnknownRecord {
  return ensureRecord(ensureRecord(config, "meetings"), "ai");
}

function resolveValueWithSource(configValue: string | null, envValue: string | undefined): {
  value: string | null;
  source: "config" | "env" | "missing";
} {
  if (configValue) {
    return { value: configValue, source: "config" };
  }
  if (envValue?.trim()) {
    return { value: envValue.trim(), source: "env" };
  }
  return { value: null, source: "missing" };
}

export function getMeetingsAiSettingsState(): MeetingsAiSettingsState {
  const config = readConfig();
  const meetingsAi = readMeetingsAiConfig(config);

  const deepgram = resolveValueWithSource(
    readString(meetingsAi.deepgramApiKey),
    process.env.DEEPGRAM_API_KEY,
  );
  const openRouter = resolveValueWithSource(
    readString(meetingsAi.openRouterApiKey),
    process.env.OPENROUTER_API_KEY,
  );

  const deepgramModel = readString(meetingsAi.deepgramModel) ?? process.env.DEEPGRAM_MODEL?.trim() ?? "nova-3";
  const openRouterModel = readString(meetingsAi.openRouterModel) ?? process.env.OPENROUTER_MODEL?.trim() ?? "openai/gpt-4o-mini";

  const notes: string[] = [];
  if (deepgram.source === "missing") {
    notes.push("Deepgram API key not configured.");
  }
  if (openRouter.source === "missing") {
    notes.push("OpenRouter API key not configured.");
  }
  if (deepgram.source === "env" || openRouter.source === "env") {
    notes.push("Environment variables are active as fallback where UI config is missing.");
  }
  if (notes.length === 0) {
    notes.push("Meetings AI providers configured.");
  }

  return {
    sectionLabel: "Meetings AI",
    deepgramApiKey: deepgram.value,
    deepgramApiKeySource: deepgram.source,
    deepgramModel,
    openRouterApiKey: openRouter.value,
    openRouterApiKeySource: openRouter.source,
    openRouterModel,
    notes,
  };
}

export function updateMeetingsAiSettings(input: MeetingsAiSettingsUpdate): MeetingsAiSettingsState {
  const config = readConfig();
  const meetingsAi = readMeetingsAiConfig(config);

  meetingsAi.deepgramApiKey = input.deepgramApiKey.trim();
  meetingsAi.deepgramModel = input.deepgramModel.trim() || "nova-3";
  meetingsAi.openRouterApiKey = input.openRouterApiKey.trim();
  meetingsAi.openRouterModel = input.openRouterModel.trim() || "openai/gpt-4o-mini";

  writeConfig(config);
  return getMeetingsAiSettingsState();
}

export function resolveMeetingsAiRuntimeConfig(): {
  deepgramApiKey: string | null;
  deepgramModel: string;
  openRouterApiKey: string | null;
  openRouterModel: string;
} {
  const state = getMeetingsAiSettingsState();
  return {
    deepgramApiKey: state.deepgramApiKey,
    deepgramModel: state.deepgramModel ?? "nova-3",
    openRouterApiKey: state.openRouterApiKey,
    openRouterModel: state.openRouterModel ?? "openai/gpt-4o-mini",
  };
}
