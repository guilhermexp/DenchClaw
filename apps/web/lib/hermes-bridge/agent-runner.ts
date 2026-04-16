/**
 * Hermes Agent Runner — Streams agent completions via ACP.
 *
 * Uses the Vercel AI SDK's `streamText()` with the ACP provider,
 * which spawns `hermes acp` as a child process and communicates
 * via JSON-RPC over stdio.
 *
 * Emits SSE events in the dashboard's expected format:
 *   { type: "text-start", id }
 *   { type: "text-delta", id, delta }
 *   { type: "text-end", id }
 *   { type: "error", errorText }
 *
 * Zero manual configuration — everything comes from the local
 * Hermes installation (~/.hermes/config.yaml, .env, auth.json).
 */

import { streamText } from "ai";
import type { ModelMessage } from "ai";
import { getOrCreateProvider, isHermesReady } from "./acp-provider";
import { resolveHermesConfig, resolveWebChatDir } from "./hermes-config";
import { buildWorkspaceSystemPrompt } from "./workspace-prompt";
import { resolveWorkspaceRoot } from "../workspace";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

// ── Types ───────────────────────────────────────────────────────────────────

export type HermesRunEvent = {
  type: string;
  [key: string]: unknown;
};

export type ImageAttachment = {
  content: string;
  mimeType: string;
  fileName?: string;
};

export type HermesRunOptions = {
  sessionId: string;
  message: string;
  modelOverride?: string;
  systemPrompt?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  imageAttachments?: ImageAttachment[];
};

// ── History Loading ─────────────────────────────────────────────────────────

function loadHistoryFromDisk(sessionId: string): ModelMessage[] {
  try {
    const dir = resolveWebChatDir();
    const filePath = join(dir, `${sessionId}.jsonl`);
    if (!existsSync(filePath)) return [];

    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    const messages: ModelMessage[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.role === "user" || entry.role === "assistant") {
          messages.push({
            role: entry.role,
            content: entry.content ?? entry.text ?? "",
          } as ModelMessage);
        }
      } catch { /* skip malformed */ }
    }

    return messages;
  } catch {
    return [];
  }
}

// ── Message Construction ────────────────────────────────────────────────────

function buildMessages(options: HermesRunOptions, workspacePath: string): ModelMessage[] {
  const messages: ModelMessage[] = [];

  const effectiveSystemPrompt = options.systemPrompt?.trim() || buildWorkspaceSystemPrompt(workspacePath);
  if (effectiveSystemPrompt) {
    messages.push({ role: "system", content: effectiveSystemPrompt } as ModelMessage);
  }

  const history = options.history ?? loadHistoryFromDisk(options.sessionId);
  for (const msg of history) {
    messages.push(msg as ModelMessage);
  }

  if (options.imageAttachments && options.imageAttachments.length > 0) {
    const parts: Array<{ type: string; text?: string; image?: { data: string; mimeType: string } }> = [
      { type: "text", text: options.message },
    ];
    for (const att of options.imageAttachments) {
      parts.push({
        type: "image",
        image: { data: att.content, mimeType: att.mimeType },
      });
    }
    messages.push({ role: "user", content: parts as unknown as string } as ModelMessage);
  } else {
    messages.push({ role: "user", content: options.message } as ModelMessage);
  }

  return messages;
}

// ── Agent Runner ────────────────────────────────────────────────────────────

export async function* runHermesAgent(
  options: HermesRunOptions,
  signal?: AbortSignal,
): AsyncGenerator<HermesRunEvent> {
  const health = isHermesReady();
  if (!health.ready) {
    const errId = randomUUID();
    yield { type: "text-start", id: errId };
    yield { type: "text-delta", id: errId, delta: `[error] ${health.reason}` };
    yield { type: "text-end", id: errId };
    yield { type: "error", errorText: health.reason };
    return;
  }

  const config = resolveHermesConfig();
  const effectiveWorkspacePath = resolveWorkspaceRoot() ?? config.workspacePath;
  const textId = randomUUID();

  try {
    const provider = getOrCreateProvider(effectiveWorkspacePath);
    const messages = buildMessages(options, effectiveWorkspacePath);
    const modelId = options.modelOverride ?? config.modelId;
    const languageModel = provider.languageModel(modelId);

    const result = streamText({
      model: languageModel,
      messages,
      abortSignal: signal,
    });

    // Emit text-start
    yield { type: "text-start", id: textId };

    let fullText = "";

    for await (const chunk of result.textStream) {
      if (signal?.aborted) break;

      fullText += chunk;
      yield { type: "text-delta", id: textId, delta: chunk };
    }

    // Emit text-end
    yield { type: "text-end", id: textId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Try to close any open text block
    yield { type: "text-end", id: textId };

    const errId = randomUUID();
    yield { type: "text-start", id: errId };
    yield { type: "text-delta", id: errId, delta: `[error] ${message}` };
    yield { type: "text-end", id: errId };
    yield { type: "error", errorText: message };
  }
}

// ── Utility ─────────────────────────────────────────────────────────────────

export function extractToolResult(raw: unknown): {
  text?: string;
  details?: Record<string, unknown>;
} | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") return { text: raw };
  if (typeof raw !== "object") return undefined;

  const r = raw as Record<string, unknown>;
  const content = Array.isArray(r.content) ? r.content : [];
  const textParts: string[] = [];

  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as Record<string, unknown>).type === "text" &&
      typeof (block as Record<string, unknown>).text === "string"
    ) {
      textParts.push((block as Record<string, unknown>).text as string);
    }
  }

  return textParts.length > 0
    ? { text: textParts.join(""), details: r }
    : { text: undefined, details: r };
}
