/**
 * Hermes Config — Auto-discovers the local Hermes installation.
 *
 * Reads directly from:
 *   - ~/.hermes/config.yaml  (model, provider, base_url)
 *   - ~/.hermes/.env         (API keys)
 *   - ~/.hermes/auth.json    (provider credentials)
 *
 * Zero manual configuration required. If Hermes is installed and working,
 * DenchClaw picks it up automatically.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import process from "node:process";

// ── Types ───────────────────────────────────────────────────────────────────

export type HermesModelConfig = {
  default: string;
  provider: string;
  base_url?: string;
};

export type HermesFullConfig = {
  model: string | HermesModelConfig;
  provider?: string;
  base_url?: string;
  providers?: Record<string, { base_url?: string }>;
  fallback_model?: { provider: string; model: string };
  _config_version?: number;
};

export type HermesResolvedConfig = {
  /** The model ID to pass to the ACP provider */
  modelId: string;
  /** The CLI command (default: "hermes") */
  command: string;
  /** Args for ACP mode */
  args: string[];
  /** HERMES_HOME directory */
  hermesHome: string;
  /** Path to config.yaml */
  configPath: string;
  /** Path to .env */
  envPath: string;
  /** Whether the Hermes CLI was found */
  cliAvailable: boolean;
  /** Whether config.yaml exists */
  configExists: boolean;
  /** Resolved workspace cwd */
  workspacePath: string;
};

// ── Singleton Cache ─────────────────────────────────────────────────────────

let _cached: HermesResolvedConfig | null = null;

// ── YAML Parsing (lightweight, no dependency needed for simple configs) ─────

function parseSimpleYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentPath: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    // Skip comments and empty lines
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Calculate indentation
    const indent = line.length - line.trimStart().length;
    const level = Math.floor(indent / 2);

    // Trim the path to current level
    currentPath = currentPath.slice(0, level);

    // Parse key: value
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value: unknown = trimmed.slice(colonIdx + 1).trim();

    // Parse value types
    if (value === "") {
      // Nested object — set path
      currentPath.push(key);
      continue;
    }

    // Remove quotes
    if (typeof value === "string") {
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // Boolean
      if (value === "true") value = true;
      else if (value === "false") value = false;
      // Number
      else if (/^\d+$/.test(value as string)) value = Number(value);
    }

    // Set value at path
    let target = result;
    for (let i = 0; i < currentPath.length; i++) {
      const k = currentPath[i];
      if (!(k in target) || typeof target[k] !== "object") {
        target[k] = {};
      }
      target = target[k] as Record<string, unknown>;
    }
    target[key] = value;
  }

  return result;
}

// ── Resolution ──────────────────────────────────────────────────────────────

function resolveHermesHome(): string {
  return process.env.HERMES_HOME ?? join(homedir(), ".hermes");
}

function readYamlConfig(path: string): HermesFullConfig | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    // Try importing yaml package first (more robust)
    try {
      const { parse } = require("yaml") as { parse: (s: string) => unknown };
      return parse(raw) as HermesFullConfig;
    } catch {
      // Fallback to simple parser
      return parseSimpleYaml(raw) as unknown as HermesFullConfig;
    }
  } catch {
    return null;
  }
}

function resolveModelFromConfig(config: HermesFullConfig | null): string {
  if (!config) return "auto"; // Let Hermes decide

  // model can be a string or an object { default, provider, base_url }
  if (typeof config.model === "string") {
    return config.model;
  }
  if (config.model && typeof config.model === "object") {
    return (config.model as HermesModelConfig).default ?? "auto";
  }
  return "auto";
}

/**
 * Check if `hermes` CLI is available in PATH.
 */
function isHermesInstalled(): boolean {
  try {
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const cmd = process.platform === "win32" ? "where hermes" : "which hermes";
    execSync(cmd, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the workspace path.
 * Priority:
 *   1. HERMES_WORKSPACE env var
 *   2. Current working directory
 */
function resolveWorkspacePath(): string {
  return process.env.HERMES_WORKSPACE ?? process.cwd();
}

/**
 * Get the fully resolved Hermes configuration.
 * Reads from the local Hermes installation — zero manual setup needed.
 */
export function resolveHermesConfig(): HermesResolvedConfig {
  if (_cached) return _cached;

  const hermesHome = resolveHermesHome();
  const configPath = join(hermesHome, "config.yaml");
  const envPath = join(hermesHome, ".env");

  const config = readYamlConfig(configPath);
  const modelId = resolveModelFromConfig(config);
  const cliAvailable = isHermesInstalled();
  const workspacePath = resolveWorkspacePath();

  _cached = {
    modelId,
    command: "hermes",
    args: ["acp"],
    hermesHome,
    configPath,
    envPath,
    cliAvailable,
    configExists: existsSync(configPath),
    workspacePath,
  };

  return _cached;
}

/**
 * Clear the cached config (useful for testing).
 */
export function clearConfigCache(): void {
  _cached = null;
}

/**
 * State dir for DenchClaw.
 * Migrates from legacy ~/.openclaw-dench if needed.
 */
export function resolveDenchClawStateDir(): string {
  const home = homedir();
  const legacyDir = join(home, ".openclaw-dench");
  const newDir = join(home, ".denchclaw");

  if (existsSync(newDir)) return newDir;
  if (existsSync(legacyDir)) return legacyDir;
  return newDir;
}

/**
 * Web chat dir for session persistence.
 */
export function resolveWebChatDir(): string {
  const stateDir = resolveDenchClawStateDir();
  return join(stateDir, "web-chat");
}
