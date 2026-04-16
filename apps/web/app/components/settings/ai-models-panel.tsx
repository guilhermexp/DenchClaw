"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

type HermesDraft = {
  defaultModel: string;
  provider: string;
  baseUrl: string;
  toolsets: string;
  fallbackProviders: string;
  providersYaml: string;
};

function buildInitialState(): AiModelsPageState {
  return {
    sectionLabel: "Hermes",
    cliAvailable: false,
    cliPath: null,
    cliVersion: null,
    acpAvailable: false,
    hermesHome: "~/.hermes",
    configPath: "~/.hermes/config.yaml",
    envPath: "~/.hermes/.env",
    configExists: false,
    defaultModel: null,
    provider: null,
    baseUrl: null,
    toolsets: [],
    fallbackProviders: [],
    configuredProviders: [],
    providersYaml: "{}",
    notes: ["Loading Hermes configuration..."],
  };
}

function stateToDraft(state: AiModelsPageState): HermesDraft {
  return {
    defaultModel: state.defaultModel ?? "",
    provider: state.provider ?? "",
    baseUrl: state.baseUrl ?? "",
    toolsets: state.toolsets.join(", "),
    fallbackProviders: state.fallbackProviders.join(", "),
    providersYaml: state.providersYaml || "{}",
  };
}

function splitCommaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        background: ok ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
        color: ok ? "rgb(34,197,94)" : "rgb(245,158,11)",
      }}
    >
      {label}
    </span>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-3" style={{ borderColor: "var(--color-border)" }}>
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </div>
      <div className={mono ? "text-sm font-medium break-all" : "text-sm font-medium"} style={{ color: "var(--color-text)" }}>
        {value}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const baseClass = "mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none transition";
  const style = { borderColor: "var(--color-border)", color: "var(--color-text)", background: "var(--color-surface)" };

  return (
    <label className="block text-sm font-medium" style={{ color: "var(--color-text)" }}>
      {label}
      {multiline ? (
        <textarea
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`${baseClass} min-h-[168px] font-mono`}
          style={style}
          spellCheck={false}
        />
      ) : (
        <input
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={baseClass}
          style={style}
        />
      )}
    </label>
  );
}

export function AiModelsPanel({ initialState }: { initialState?: AiModelsPageState }) {
  const [data, setData] = useState<AiModelsPageState>(initialState ?? buildInitialState());
  const [draft, setDraft] = useState<HermesDraft>(stateToDraft(initialState ?? buildInitialState()));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const hydrate = useCallback((next: AiModelsPageState) => {
    setData(next);
    setDraft(stateToDraft(next));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaveMessage(null);
    try {
      const response = await fetch("/api/settings/hermes", { cache: "no-store" });
      const payload = (await response.json()) as AiModelsPageState | { error?: string };
      if (!response.ok || !("sectionLabel" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Failed to refresh Hermes config.");
      }
      hydrate(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh Hermes config.");
    } finally {
      setLoading(false);
    }
  }, [hydrate]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const response = await fetch("/api/settings/hermes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultModel: draft.defaultModel,
          provider: draft.provider,
          baseUrl: draft.baseUrl,
          toolsets: splitCommaList(draft.toolsets),
          fallbackProviders: splitCommaList(draft.fallbackProviders),
          providersYaml: draft.providersYaml,
        }),
      });
      const payload = (await response.json()) as AiModelsPageState | { error?: string };
      if (!response.ok || !("sectionLabel" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Failed to save Hermes config.");
      }
      hydrate(payload);
      setSaveMessage("Hermes config saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Hermes config.");
    } finally {
      setSaving(false);
    }
  }, [draft, hydrate]);

  useEffect(() => {
    if (!initialState) {
      void refresh();
    }
  }, [initialState, refresh]);

  const providersPreview = useMemo(() => {
    return data.configuredProviders.length === 0
      ? null
      : data.configuredProviders.map((provider) => (
        <div key={provider.id} className="rounded-xl border p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              {provider.id}
            </div>
            <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {provider.keys.length} keys
            </div>
          </div>
          <div className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Base URL: {provider.baseUrl ?? "not set"}
          </div>
          <div className="mt-2 text-xs break-all" style={{ color: "var(--color-text-muted)" }}>
            Keys: {provider.keys.join(", ") || "none"}
          </div>
        </div>
      ));
  }, [data.configuredProviders]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <section className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--color-text)" }}>
              Hermes
            </h1>
            <p className="max-w-2xl text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
              Esta área lê a configuração real do Hermes em ~/.hermes/config.yaml e agora também permite trocar modelo, provider e providers nomeados direto pela UI.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || saving}
              className="h-10 rounded-xl border px-4 text-sm font-medium transition disabled:opacity-60"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
            >
              {loading ? "Refreshing..." : "Refresh Hermes config"}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={loading || saving}
              className="h-10 rounded-xl px-4 text-sm font-medium transition disabled:opacity-60"
              style={{ background: "var(--color-accent)", color: "white" }}
            >
              {saving ? "Saving..." : "Save Hermes config"}
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

        <div className="flex flex-wrap gap-2">
          <StatusBadge ok={data.cliAvailable} label={data.cliAvailable ? "CLI detected" : "CLI missing"} />
          <StatusBadge ok={data.configExists} label={data.configExists ? "config.yaml found" : "config.yaml missing"} />
          <StatusBadge ok={data.acpAvailable} label={data.acpAvailable ? "ACP available" : "ACP unavailable"} />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <InfoRow label="Default model" value={data.defaultModel ?? "Not configured"} />
          <InfoRow label="Provider" value={data.provider ?? "Not configured"} />
          <InfoRow label="Base URL" value={data.baseUrl ?? "Not configured"} mono />
          <InfoRow label="Hermes home" value={data.hermesHome} mono />
          <InfoRow label="Config path" value={data.configPath} mono />
          <InfoRow label="CLI path" value={data.cliPath ?? "Hermes not found in PATH"} mono />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--color-border)" }}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>Editable active model config</h2>
                  <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                    Changes are persisted back to ~/.hermes/config.yaml.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Default model" value={draft.defaultModel} onChange={(value) => setDraft((current) => ({ ...current, defaultModel: value }))} placeholder="gpt-5.4" />
                <Field label="Provider" value={draft.provider} onChange={(value) => setDraft((current) => ({ ...current, provider: value }))} placeholder="openai-codex" />
              </div>
              <div className="mt-4">
                <Field label="Base URL" value={draft.baseUrl} onChange={(value) => setDraft((current) => ({ ...current, baseUrl: value }))} placeholder="https://chatgpt.com/backend-api/codex/" />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Toolsets" value={draft.toolsets} onChange={(value) => setDraft((current) => ({ ...current, toolsets: value }))} placeholder="terminal, file, web" />
                <Field label="Fallback providers" value={draft.fallbackProviders} onChange={(value) => setDraft((current) => ({ ...current, fallbackProviders: value }))} placeholder="provider-a, provider-b" />
              </div>
            </div>

            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--color-border)" }}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>Named providers from Hermes config</h2>
                  <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                    Edit the provider map as YAML. Example: provider-id, api, base_url, model, headers.
                  </p>
                </div>
                <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                  {data.configuredProviders.length} detected
                </span>
              </div>

              <Field
                label="Providers YAML"
                value={draft.providersYaml}
                onChange={(value) => setDraft((current) => ({ ...current, providersYaml: value }))}
                multiline
                placeholder={"openai-codex:\n  base_url: https://chatgpt.com/backend-api/codex/"}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--color-border)" }}>
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>Runtime summary</h2>
              <div className="mt-4 space-y-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
                <div>
                  <span className="font-medium" style={{ color: "var(--color-text)" }}>CLI version:</span>{" "}
                  {data.cliVersion ?? "Unavailable"}
                </div>
                <div>
                  <span className="font-medium" style={{ color: "var(--color-text)" }}>Toolsets:</span>{" "}
                  {data.toolsets.length > 0 ? data.toolsets.join(", ") : "None configured"}
                </div>
                <div>
                  <span className="font-medium" style={{ color: "var(--color-text)" }}>Fallback providers:</span>{" "}
                  {data.fallbackProviders.length > 0 ? data.fallbackProviders.join(", ") : "None configured"}
                </div>
                <div>
                  <span className="font-medium" style={{ color: "var(--color-text)" }}>.env path:</span>{" "}
                  <span className="break-all">{data.envPath}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--color-border)" }}>
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>Parsed provider preview</h2>
              <div className="mt-4 space-y-3">
                {providersPreview ?? (
                  <div className="rounded-xl border border-dashed p-4 text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                    No named providers found in the Hermes config file.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--color-border)" }}>
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>Notes</h2>
              <ul className="mt-4 space-y-2 text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
                {data.notes.map((note, index) => (
                  <li key={`${index}-${note}`} className="flex gap-2">
                    <span style={{ color: "var(--color-accent)" }}>•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
