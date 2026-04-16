/**
 * ACP Provider — Singleton manager for the Hermes ACP connection.
 *
 * Uses @mcpc-tech/acp-ai-provider to spawn `hermes acp` as a child process
 * and communicate via JSON-RPC over stdio. This is the canonical way to
 * integrate with Hermes — no HTTP, no ports, no manual config.
 *
 * The provider automatically:
 *   - Detects the installed Hermes CLI
 *   - Reads ~/.hermes/config.yaml for model/provider settings
 *   - Reads ~/.hermes/.env for API keys
 *   - Creates and persists ACP sessions
 *   - Exposes tools registered by MCP bridges
 */

import { createACPProvider } from "@mcpc-tech/acp-ai-provider";
import type { ACPProviderSettings } from "@mcpc-tech/acp-ai-provider";
import { resolveHermesConfig, type HermesResolvedConfig } from "./hermes-config";
import { randomUUID } from "node:crypto";
import process from "node:process";

// ── Types ───────────────────────────────────────────────────────────────────

export type HermesACPProvider = ReturnType<typeof createACPProvider>;

export type ProviderKey = string;

// ── Provider Registry ───────────────────────────────────────────────────────

/**
 * Active ACP providers indexed by a composite key:
 *   `${cwd}::${configFingerprint}`
 *
 * This ensures each workspace/config combo gets its own provider (and thus
 * its own Hermes session), while reusing providers when nothing changed.
 */
const providers = new Map<ProviderKey, HermesACPProvider>();

function makeKey(cwd: string, config: HermesResolvedConfig): ProviderKey {
  return `${cwd}::${config.command}::${config.args.join(",")}`;
}

/**
 * Get or create an ACP provider for the given workspace.
 */
export function getOrCreateProvider(
  cwd: string,
  existingSessionId?: string,
): HermesACPProvider {
  const config = resolveHermesConfig();
  const key = makeKey(cwd, config);

  let provider = providers.get(key);
  if (provider) return provider;

  const settings: ACPProviderSettings = {
    command: config.command,
    args: config.args,
    env: {
      ...process.env,
      HERMES_HOME: config.hermesHome,
    } as Record<string, string>,
    session: {
      cwd,
      mcpServers: [],
    },
    existingSessionId,
    persistSession: true,
    sessionDelayMs: 1000, // Give Hermes time to load MCP bridges
  };

  provider = createACPProvider(settings);
  providers.set(key, provider);

  return provider;
}

/**
 * Get an existing provider for the given workspace, or null.
 */
export function getExistingProvider(cwd: string): HermesACPProvider | null {
  const config = resolveHermesConfig();
  const key = makeKey(cwd, config);
  return providers.get(key) ?? null;
}

/**
 * Remove a provider from the registry (e.g. on session end).
 */
export function disposeProvider(cwd: string): void {
  const config = resolveHermesConfig();
  const key = makeKey(cwd, config);
  providers.delete(key);
}

/**
 * Get all active provider keys (for debugging/admin).
 */
export function getActiveProviderKeys(): ProviderKey[] {
  return Array.from(providers.keys());
}

// ── Convenience ─────────────────────────────────────────────────────────────

/**
 * Quick health check — is the Hermes CLI available?
 */
export function isHermesReady(): { ready: boolean; reason: string } {
  const config = resolveHermesConfig();

  if (!config.cliAvailable) {
    return {
      ready: false,
      reason: "Hermes CLI not found in PATH. Install with: curl -fsSL https://hermes.nous.ai/install.sh | bash",
    };
  }

  if (!config.configExists) {
    return {
      ready: false,
      reason: `Hermes config not found at ${config.configPath}. Run 'hermes' once to create it.`,
    };
  }

  return { ready: true, reason: "Hermes is installed and configured." };
}
