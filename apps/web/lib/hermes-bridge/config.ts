/**
 * Hermes Bridge Configuration — State directory and config management.
 *
 * Replaces the OpenClaw state dir (~/.openclaw-dench) with a DenchClaw-native
 * one (~/.denchclaw) while maintaining backward compatibility.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  cpSync,
} from "node:fs";

// ── Constants ───────────────────────────────────────────────────────────────

const DENCH_STATE_DIRNAME = ".denchclaw";
const LEGACY_STATE_DIRNAME = ".openclaw-dench";
const CONFIG_FILENAME = "denchclaw.json";
const LEGACY_CONFIG_FILENAME = "openclaw.json";

// ── Config Types ────────────────────────────────────────────────────────────

export type HermesConnectionConfig = {
  apiUrl?: string;
  apiKey?: string;
  defaultModel?: string;
};

export type DenchCloudConfig = {
  gatewayUrl?: string;
  apiKey?: string;
  model?: string;
};

export type DenchClawConfig = {
  hermes?: HermesConnectionConfig;
  cloud?: DenchCloudConfig;
  workspace?: {
    defaultName?: string;
  };
  telemetry?: {
    enabled?: boolean;
    anonymousId?: string;
  };
  /** Gateway port (legacy compat, used by web-runtime). */
  gateway?: {
    port?: number;
  };
  /** Plugin/extension entries (legacy compat). */
  plugins?: {
    entries?: Record<string, {
      enabled?: boolean;
      config?: Record<string, unknown>;
    }>;
  };
};

// ── State Directory Resolution ──────────────────────────────────────────────

/**
 * Resolve the mutable state directory.
 * Priority:
 *   1. DENCHCLAW_STATE_DIR env var
 *   2. ~/.denchclaw (new)
 *   3. ~/.openclaw-dench (legacy fallback if new doesn't exist)
 */
export function resolveHermesStateDir(): string {
  const home = process.env.DENCHCLAW_HOME?.trim() || homedir();

  // Explicit override
  const envDir = process.env.DENCHCLAW_STATE_DIR?.trim();
  if (envDir) return envDir;

  // New location
  const newDir = join(home, DENCH_STATE_DIRNAME);
  if (existsSync(newDir)) return newDir;

  // Legacy fallback
  const legacyDir = join(home, LEGACY_STATE_DIRNAME);
  if (existsSync(legacyDir)) return legacyDir;

  // Default to new location (will be created on first write)
  return newDir;
}

/**
 * Ensure the state directory exists.
 */
export function ensureStateDir(): string {
  const dir = resolveHermesStateDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ── Config Read/Write ───────────────────────────────────────────────────────

function findConfigPath(): string {
  const stateDir = resolveHermesStateDir();

  // Prefer new config name
  const newConfig = join(stateDir, CONFIG_FILENAME);
  if (existsSync(newConfig)) return newConfig;

  // Fall back to legacy config name
  const legacyConfig = join(stateDir, LEGACY_CONFIG_FILENAME);
  if (existsSync(legacyConfig)) return legacyConfig;

  // Default to new name
  return newConfig;
}

/**
 * Read the DenchClaw configuration.
 */
export function readConfig(): DenchClawConfig {
  const configPath = findConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as DenchClawConfig;
  } catch {
    return {};
  }
}

/**
 * Write the DenchClaw configuration.
 */
export function writeConfig(config: DenchClawConfig): void {
  const stateDir = ensureStateDir();
  const configPath = join(stateDir, CONFIG_FILENAME);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * Update config partially (merge with existing).
 */
export function updateConfig(patch: Partial<DenchClawConfig>): DenchClawConfig {
  const existing = readConfig();
  const merged = { ...existing, ...patch };
  writeConfig(merged);
  return merged;
}

// ── Migration ───────────────────────────────────────────────────────────────

/**
 * Migrate config and data from the legacy ~/.openclaw-dench to ~/.denchclaw.
 * Returns true if migration was performed.
 */
export function migrateFromLegacyConfig(): boolean {
  const home = homedir();
  const legacyDir = join(home, LEGACY_STATE_DIRNAME);
  const newDir = join(home, DENCH_STATE_DIRNAME);

  // No legacy dir — nothing to migrate
  if (!existsSync(legacyDir)) return false;

  // Already migrated
  if (existsSync(newDir)) return false;

  try {
    // Copy the entire directory
    cpSync(legacyDir, newDir, { recursive: true });

    // Rename config file if needed
    const legacyConfig = join(newDir, LEGACY_CONFIG_FILENAME);
    const newConfig = join(newDir, CONFIG_FILENAME);
    if (existsSync(legacyConfig) && !existsSync(newConfig)) {
      try {
        const data = JSON.parse(readFileSync(legacyConfig, "utf-8"));
        writeFileSync(newConfig, JSON.stringify(data, null, 2) + "\n", "utf-8");
      } catch {
        // best effort
      }
    }

    return true;
  } catch {
    return false;
  }
}

// ── Workspace Paths ─────────────────────────────────────────────────────────

export function resolveWorkspaceDir(workspaceName: string = "default"): string {
  const stateDir = resolveHermesStateDir();
  if (workspaceName === "default") {
    // Check both patterns
    const root = join(stateDir, "workspace");
    if (existsSync(root)) return root;
    const prefixed = join(stateDir, "workspace-default");
    if (existsSync(prefixed)) return prefixed;
    return root;
  }
  return join(stateDir, `workspace-${workspaceName}`);
}

export function resolveWebChatDir(): string {
  return join(resolveHermesStateDir(), "web-chat");
}

export function resolveExtensionsDir(): string {
  return join(resolveHermesStateDir(), "extensions");
}

export function resolveAgentsDir(): string {
  return join(resolveHermesStateDir(), "agents");
}

export function resolveSubagentsDir(): string {
  return join(resolveHermesStateDir(), "subagents");
}

// ── Hermes Connection ───────────────────────────────────────────────────────

/**
 * Resolve the effective Hermes connection config.
 * Priority: env vars > config file > defaults.
 */
export function resolveHermesConnection(): Required<Pick<HermesConnectionConfig, "apiUrl">> & HermesConnectionConfig {
  const config = readConfig();
  return {
    apiUrl: process.env.HERMES_API_URL ?? config.hermes?.apiUrl ?? "http://localhost:21321",
    apiKey: process.env.HERMES_API_KEY ?? config.hermes?.apiKey,
    defaultModel: config.hermes?.defaultModel ?? "claude-sonnet-4",
  };
}
