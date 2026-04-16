/**
 * Hermes Bridge — Barrel Export
 *
 * Re-exports everything the chat API routes need from the Hermes bridge,
 * maintaining the same interface as the old @/lib/active-runs and
 * @/lib/agent-runner modules.
 *
 * Architecture: The bridge communicates with the local Hermes installation
 * via ACP (Agent Communication Protocol) over stdio using `hermes acp`.
 * Zero manual configuration — everything is auto-detected from:
 *   - ~/.hermes/config.yaml  (model, provider)
 *   - ~/.hermes/.env          (API keys)
 *   - ~/.hermes/auth.json     (credentials)
 */

// ── From active-runs.ts ─────────────────────────────────────────────────────
export {
  getActiveRun,
  hasActiveRun,
  getRunningSessionIds,
  startRun,
  startSubscribeRun,
  subscribeToRun,
  reactivateSubscribeRun,
  persistUserMessage,
  persistSubscribeUserMessage,
  abortActiveRun,
  abortActiveRun as abortRun,
  enrichSubagentSessionFromTranscript,
  type ActiveRun,
  type SseEvent,
  type RunSubscriber,
  type StartRunOptions,
  type SubscribeToRunOptions,
} from "./active-runs";

// ── From agent-runner.ts ────────────────────────────────────────────────────
export {
  runHermesAgent,
  extractToolResult,
  type HermesRunEvent,
  type ImageAttachment,
  type HermesRunOptions,
} from "./agent-runner";

// ── From hermes-config.ts ───────────────────────────────────────────────────
export {
  resolveHermesConfig,
  resolveDenchClawStateDir,
  resolveWebChatDir,
  type HermesResolvedConfig,
} from "./hermes-config";

// ── From acp-provider.ts ────────────────────────────────────────────────────
export {
  getOrCreateProvider,
  getExistingProvider,
  disposeProvider,
  isHermesReady,
  type HermesACPProvider,
} from "./acp-provider";
