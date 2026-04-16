"use client";

import { useCallback, useEffect, useState } from "react";

import type { MeetingsAiSettingsState } from "@/lib/meetings-ai-settings";

type DraftState = {
  deepgramApiKey: string;
  deepgramModel: string;
  openRouterApiKey: string;
  openRouterModel: string;
};

function toDraft(state: MeetingsAiSettingsState): DraftState {
  return {
    deepgramApiKey: state.deepgramApiKey ?? "",
    deepgramModel: state.deepgramModel ?? "",
    openRouterApiKey: state.openRouterApiKey ?? "",
    openRouterModel: state.openRouterModel ?? "",
  };
}

export function MeetingsAiSettingsPanel({ initialState }: { initialState?: MeetingsAiSettingsState }) {
  const [state, setState] = useState<MeetingsAiSettingsState | null>(initialState ?? null);
  const [draft, setDraft] = useState<DraftState>(initialState ? toDraft(initialState) : {
    deepgramApiKey: "",
    deepgramModel: "nova-3",
    openRouterApiKey: "",
    openRouterModel: "openai/gpt-4o-mini",
  });
  const [loading, setLoading] = useState(!initialState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const hydrate = useCallback((next: MeetingsAiSettingsState) => {
    setState(next);
    setDraft(toDraft(next));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/meetings-ai", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load meetings AI settings.");
      }
      hydrate(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load meetings AI settings.");
    } finally {
      setLoading(false);
    }
  }, [hydrate]);

  useEffect(() => {
    if (!initialState) {
      void refresh();
    }
  }, [initialState, refresh]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const response = await fetch("/api/settings/meetings-ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save meetings AI settings.");
      }
      hydrate(payload);
      setSaveMessage("Meetings AI settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save meetings AI settings.");
    } finally {
      setSaving(false);
    }
  }, [draft, hydrate]);

  return (
    <section
      className="rounded-3xl border p-6 space-y-5"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-text)" }}>
            Meetings AI
          </h2>
          <p className="mt-1 text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
            Configure Deepgram for transcription and OpenRouter for beautify/title generation.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || saving}
            className="h-10 rounded-xl border px-4 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving}
            className="h-10 rounded-xl px-4 text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--color-accent)", color: "white" }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "rgba(239,68,68,0.25)", color: "rgb(239,68,68)" }}>
          {error}
        </div>
      ) : null}

      {saveMessage ? (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "rgba(34,197,94,0.25)", color: "rgb(34,197,94)" }}>
          {saveMessage}
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <label className="block text-sm font-medium" style={{ color: "var(--color-text)" }}>
          Deepgram API Key
          <input
            aria-label="Deepgram API Key"
            type="password"
            value={draft.deepgramApiKey}
            onChange={(event) => setDraft((prev) => ({ ...prev, deepgramApiKey: event.target.value }))}
            className="mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)", background: "var(--color-bg)" }}
          />
          <span className="mt-1 block text-xs" style={{ color: "var(--color-text-muted)" }}>
            Source: {state?.deepgramApiKeySource ?? "missing"}
          </span>
        </label>

        <label className="block text-sm font-medium" style={{ color: "var(--color-text)" }}>
          Deepgram Model
          <input
            aria-label="Deepgram Model"
            value={draft.deepgramModel}
            onChange={(event) => setDraft((prev) => ({ ...prev, deepgramModel: event.target.value }))}
            className="mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)", background: "var(--color-bg)" }}
          />
        </label>

        <label className="block text-sm font-medium" style={{ color: "var(--color-text)" }}>
          OpenRouter API Key
          <input
            aria-label="OpenRouter API Key"
            type="password"
            value={draft.openRouterApiKey}
            onChange={(event) => setDraft((prev) => ({ ...prev, openRouterApiKey: event.target.value }))}
            className="mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)", background: "var(--color-bg)" }}
          />
          <span className="mt-1 block text-xs" style={{ color: "var(--color-text-muted)" }}>
            Source: {state?.openRouterApiKeySource ?? "missing"}
          </span>
        </label>

        <label className="block text-sm font-medium" style={{ color: "var(--color-text)" }}>
          OpenRouter Model
          <input
            aria-label="OpenRouter Model"
            value={draft.openRouterModel}
            onChange={(event) => setDraft((prev) => ({ ...prev, openRouterModel: event.target.value }))}
            className="mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)", background: "var(--color-bg)" }}
          />
        </label>
      </div>

      <div className="space-y-2">
        {state?.notes.map((note) => (
          <div
            key={note}
            className="rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
          >
            {note}
          </div>
        ))}
      </div>
    </section>
  );
}
