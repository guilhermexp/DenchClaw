/**
 * Hermes Active Runs — Manages running agent sessions via ACP.
 *
 * Drop-in replacement for the old active-runs.ts. Maintains the same
 * public interface but routes everything through the Hermes ACP agent
 * runner instead of OpenClaw gateway WebSocket.
 *
 * Key design:
 *   - Singleton Map on globalThis (survives Next.js HMR)
 *   - Event buffer for replay on reconnect
 *   - Fan-out to multiple SSE subscribers
 *   - Async generator-based run lifecycle
 *   - Persist messages to .jsonl on disk
 */

import {
  runHermesAgent,
  extractToolResult,
  type HermesRunEvent,
} from "./agent-runner";
import { resolveWebChatDir } from "./hermes-config";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, basename } from "node:path";
import { randomUUID } from "node:crypto";

// Re-export types for backward compat
export type SseEvent = Record<string, unknown> & { type: string };
export type RunSubscriber = (event: SseEvent | null) => void;

// ── Accumulated Message Parts ───────────────────────────────────────────────

type AccumulatedPart =
  | { type: "reasoning"; text: string }
  | {
      type: "tool-invocation";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      result?: Record<string, unknown>;
      errorText?: string;
    }
  | { type: "text"; text: string };

type AccumulatedMessage = {
  id: string;
  role: "assistant";
  parts: AccumulatedPart[];
};

// ── Active Run Type ─────────────────────────────────────────────────────────

export type ActiveRun = {
  sessionId: string;
  status: "running" | "completed" | "error";
  eventBuffer: SseEvent[];
  subscribers: Set<RunSubscriber>;
  accumulated: AccumulatedMessage;
  startedAt: number;
  abortController: AbortController;
  _persistTimer: ReturnType<typeof setTimeout> | null;
  _lastPersistedAt: number;
  lastGlobalSeq: number;
  sessionKey?: string;
  parentSessionId?: string;
  task?: string;
  isSubscribeOnly?: boolean;
};

// ── Constants ───────────────────────────────────────────────────────────────

const PERSIST_INTERVAL_MS = 2_000;
const CLEANUP_GRACE_MS = 30_000;

// ── Singleton Registry ──────────────────────────────────────────────────────

const GLOBAL_KEY = "__denchclaw_hermesActiveRuns" as const;

function getActiveRunsMap(): Map<string, ActiveRun> {
  if (!(globalThis as Record<string, unknown>)[GLOBAL_KEY]) {
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = new Map<string, ActiveRun>();
  }
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as Map<string, ActiveRun>;
}

// ── Persistence ─────────────────────────────────────────────────────────────

function safeSessionFilePath(sessionId: string): string {
  const dir = resolve(resolveWebChatDir());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const safe = resolve(dir, basename(sessionId) + ".jsonl");
  if (!safe.startsWith(dir + "/")) {
    throw new Error("Invalid session id");
  }
  return safe;
}

function persistUserMessage(sessionId: string, msg: {
  id: string;
  content: string;
  parts?: unknown[];
  html?: string;
}): void {
  try {
    const filePath = safeSessionFilePath(sessionId);
    const entry = {
      id: msg.id,
      role: "user",
      content: msg.content,
      parts: msg.parts,
      html: msg.html,
      timestamp: new Date().toISOString(),
    };
    writeFileSync(filePath, JSON.stringify(entry) + "\n", { flag: "a" });
  } catch { /* best effort */ }
}

function flushAccumulatedMessage(run: ActiveRun): void {
  try {
    const parts = run.accumulated.parts;
    if (parts.length === 0) return;

    const textParts = parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");

    if (!textParts.trim()) return;

    const filePath = safeSessionFilePath(run.sessionId);
    const entry = {
      id: run.accumulated.id,
      role: "assistant",
      content: textParts,
      parts: parts.map((p) => ({ ...p })),
      timestamp: new Date().toISOString(),
    };
    writeFileSync(filePath, JSON.stringify(entry) + "\n", { flag: "a" });
  } catch { /* best effort */ }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getActiveRun(sessionId: string): ActiveRun | undefined {
  return getActiveRunsMap().get(sessionId);
}

export function hasActiveRun(sessionId: string): boolean {
  const run = getActiveRunsMap().get(sessionId);
  return run !== undefined && run.status === "running";
}

export function getRunningSessionIds(): string[] {
  const ids: string[] = [];
  for (const [id, run] of Array.from(getActiveRunsMap())) {
    if (run.status === "running") ids.push(id);
  }
  return ids;
}

// ── Start Run Options ───────────────────────────────────────────────────────

export type StartRunOptions = {
  sessionId: string;
  message: string;
  agentSessionId?: string;
  overrideAgentId?: string;
  modelOverride?: string;
  imageAttachments?: Array<{
    content: string;
    mimeType: string;
    fileName?: string;
  }>;
};

/**
 * Start a new Hermes ACP agent run.
 */
export function startRun(options: StartRunOptions): ActiveRun {
  const runs = getActiveRunsMap();

  const existing = runs.get(options.sessionId);
  if (existing && existing.status === "running") {
    throw new Error(`Active run already exists for session ${options.sessionId}`);
  }

  const abortController = new AbortController();

  const run: ActiveRun = {
    sessionId: options.sessionId,
    status: "running",
    eventBuffer: [],
    subscribers: new Set(),
    accumulated: {
      id: randomUUID(),
      role: "assistant",
      parts: [],
    },
    startedAt: Date.now(),
    abortController,
    _persistTimer: null,
    _lastPersistedAt: Date.now(),
    lastGlobalSeq: 0,
  };

  runs.set(options.sessionId, run);

  (async () => {
    let fullText = "";

    try {
      for await (const event of runHermesAgent(
        {
          sessionId: options.sessionId,
          message: options.message,
          modelOverride: options.modelOverride,
          imageAttachments: options.imageAttachments,
        },
        abortController.signal,
      )) {
        // Events come flat from agent-runner: { type, id, delta, ... }
        const sseEvent: SseEvent = { ...event };
        run.eventBuffer.push(sseEvent);

        // Accumulate text deltas
        if (event.type === "text-delta" && event.delta) {
          fullText += event.delta as string;
        }

        // On text-end, push accumulated text to message parts
        if (event.type === "text-end" && fullText) {
          run.accumulated.parts.push({ type: "text", text: fullText });
        }

        // Fan out to subscribers
        for (const sub of Array.from(run.subscribers)) {
          try { sub(sseEvent); } catch { /* ignore */ }
        }

        // Periodic persistence
        if (event.type === "text-delta") {
          schedulePeriodicPersist(run);
        }
      }
    } catch (err) {
      const errorEvent: SseEvent = {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      };
      run.eventBuffer.push(errorEvent);
      for (const sub of Array.from(run.subscribers)) {
        try { sub(errorEvent); } catch { /* ignore */ }
      }
    } finally {
      flushAccumulatedMessage(run);
      if (run._persistTimer) {
        clearTimeout(run._persistTimer);
        run._persistTimer = null;
      }

      run.status = abortController.signal.aborted ? "error" : "completed";

      for (const sub of Array.from(run.subscribers)) {
        try { sub(null); } catch { /* ignore */ }
      }

      setTimeout(() => {
        const current = runs.get(options.sessionId);
        if (current === run) {
          runs.delete(options.sessionId);
        }
      }, CLEANUP_GRACE_MS);
    }
  })();

  return run;
}

function schedulePeriodicPersist(run: ActiveRun): void {
  if (run._persistTimer) return;
  run._persistTimer = setTimeout(() => {
    run._persistTimer = null;
    run._lastPersistedAt = Date.now();
    flushAccumulatedMessage(run);
  }, PERSIST_INTERVAL_MS);
}

// ── Subscribe ───────────────────────────────────────────────────────────────

export type SubscribeToRunOptions = {
  replay?: boolean;
  replayTerminalBuffer?: boolean;
};

export function subscribeToRun(
  sessionId: string,
  callback: RunSubscriber,
  options?: SubscribeToRunOptions,
): (() => void) | null {
  const run = getActiveRunsMap().get(sessionId);
  if (!run) return null;

  run.subscribers.add(callback);

  if (options?.replay) {
    for (const event of run.eventBuffer) {
      try { callback(event); } catch { /* ignore */ }
    }
  }

  if (run.status === "completed" || run.status === "error") {
    try { callback(null); } catch { /* ignore */ }
  }

  return () => {
    run.subscribers.delete(callback);
  };
}

// ── Subagent Support ────────────────────────────────────────────────────────

export function startSubscribeRun(options: {
  sessionKey: string;
  parentSessionId: string;
  task: string;
  label?: string;
}): ActiveRun {
  const runs = getActiveRunsMap();

  const run: ActiveRun = {
    sessionId: options.sessionKey,
    sessionKey: options.sessionKey,
    parentSessionId: options.parentSessionId,
    task: options.task,
    status: "running",
    eventBuffer: [],
    subscribers: new Set(),
    accumulated: {
      id: randomUUID(),
      role: "assistant",
      parts: [],
    },
    startedAt: Date.now(),
    abortController: new AbortController(),
    _persistTimer: null,
    _lastPersistedAt: Date.now(),
    lastGlobalSeq: 0,
    isSubscribeOnly: true,
  };

  runs.set(options.sessionKey, run);
  return run;
}

export function reactivateSubscribeRun(sessionKey: string, message: string): void {
  // Placeholder — will be wired when subagent support is complete
}

export async function persistSubscribeUserMessage(
  sessionKey: string,
  msg: { id: string; text: string },
): Promise<void> {
  // Placeholder
}

// ── Abort ───────────────────────────────────────────────────────────────────

export function abortActiveRun(sessionId: string): void {
  const run = getActiveRunsMap().get(sessionId);
  if (run) {
    run.abortController.abort();
    run.status = "error";
  }
}

// Alias for backward compat
export { abortActiveRun as abortRun };

export { persistUserMessage };

// ── Subagent Enrichment (stub) ──────────────────────────────────────────────

export function enrichSubagentSessionFromTranscript(_sessionKey: string): void {
  // No-op: Hermes subagent enrichment will be implemented later
}
