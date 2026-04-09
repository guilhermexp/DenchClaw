"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Search } from "lucide-react";

type ProviderId =
  | "anthropic"
  | "google"
  | "nvidia"
  | "ollama"
  | "openai"
  | "openai-codex"
  | "openrouter"
  | "venice"
  | "xai"
  | "zai"
  | "minimax"
  | "moonshot"
  | "kimi-coding";

type Provider = {
  id: ProviderId;
  name: string;
  description: string;
  authType: "api_key" | "setup_token" | "oauth" | "ollama";
  recommended?: boolean;
  popular?: boolean;
  privacyFirst?: boolean;
  localModels?: boolean;
  placeholder?: string;
  helpUrl?: string;
  helpText?: string;
  configured: boolean;
  modelCount: number;
};

type Model = {
  key: string;
  provider: string;
  providerId: ProviderId | null;
  modelId: string;
  name: string;
  input: string;
  contextWindow: number | null;
  available: boolean;
  local: boolean;
  missing: boolean;
};

export type AiModelsPageState = {
  providers: Provider[];
  models: Model[];
  selectedProvider: ProviderId | null;
  primaryModel: string | null;
  warning: string | null;
};

type RefreshInfo = {
  attempted: boolean;
  restarted: boolean;
  error: string | null;
  profile: string;
};

type Notice = {
  tone: "success" | "warning" | "error";
  message: string;
};

type RuntimeTestResult = {
  ok: boolean;
  provider: string | null;
  model: string | null;
  text: string | null;
  error: string | null;
};

type SelectorOption = {
  id: string;
  title: string;
  description?: string | null;
  badge?: string | null;
  muted?: boolean;
};

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function toneClass(tone: Notice["tone"]): string {
  if (tone === "success") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  if (tone === "warning") return "border-amber-500/25 bg-amber-500/10 text-amber-200";
  return "border-red-500/25 bg-red-500/10 text-red-200";
}

function normalizeKeyLabel(value: string): string {
  return value
    .split(/[/:_-]+/g)
    .filter(Boolean)
    .map((part) => {
      if (/^gpt\d/i.test(part)) {
        return part.toUpperCase();
      }
      if (/^\d+(\.\d+)?$/.test(part)) {
        return part;
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("-");
}

function formatContextWindow(value: number | null): string | null {
  if (!value) return null;
  if (value >= 1_000_000) return `ctx ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `ctx ${Math.round(value / 1_000)}K`;
  return `ctx ${value}`;
}

function getTierLabel(model: Model | null): string | null {
  if (!model) return null;
  const haystack = `${model.name} ${model.modelId}`.toLowerCase();
  if (haystack.includes("opus") || haystack.includes("gpt-5.4")) return "Ultra";
  if (haystack.includes("sonnet") || haystack.includes("pro") || haystack.includes("gpt-5.1")) return "Pro";
  if (haystack.includes("flash") || haystack.includes("mini") || haystack.includes("haiku")) return "Fast";
  return null;
}

function sortModels(models: Model[]): Model[] {
  return models.slice().sort((left, right) => {
    if (left.available !== right.available) return left.available ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(event.target as Node)) return;
      onOutside();
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onOutside]);

  return ref;
}

function NoticeBanner({ notice }: { notice: Notice }) {
  return (
    <div className={cn("rounded-2xl border px-4 py-3 text-sm", toneClass(notice.tone))}>
      {notice.message}
    </div>
  );
}

function Selector({
  label,
  placeholder,
  value,
  badge,
  disabled,
  options,
  search,
  onSearchChange,
  open,
  onToggle,
  onSelect,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  badge?: string | null;
  disabled?: boolean;
  options: SelectorOption[];
  search: string;
  onSearchChange: (value: string) => void;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}) {
  const ref = useClickOutside<HTMLDivElement>(() => {
    if (open) onToggle();
  });

  return (
    <div className="space-y-2.5">
      <div className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </div>
      <div ref={ref} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          className="flex h-12 w-full items-center justify-between rounded-xl border px-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            borderColor: "var(--color-border)",
            background: "color-mix(in oklab, var(--color-surface) 92%, black)",
            color: "var(--color-text)",
          }}
        >
          <div className="min-w-0">
            <div className={cn("truncate text-sm", value ? "" : "opacity-60")}>
              {value ?? placeholder}
            </div>
          </div>
          <div className="ml-4 flex items-center gap-3">
            {badge ? (
              <span
                className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ background: "rgba(255,255,255,0.08)", color: "var(--color-text-muted)" }}
              >
                {badge}
              </span>
            ) : null}
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition", open ? "rotate-180" : "")} />
          </div>
        </button>

        {open ? (
          <div
            className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border"
            style={{
              borderColor: "rgba(255,255,255,0.12)",
              background: "rgba(18,18,20,0.96)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
            }}
          >
            <div className="border-b p-3" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <label className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "rgba(255,255,255,0.16)" }}>
                <Search className="h-4 w-4" style={{ color: "var(--color-text-muted)" }} />
                <input
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Search..."
                  className="w-full bg-transparent text-sm outline-none"
                  style={{ color: "var(--color-text)" }}
                />
              </label>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {options.length === 0 ? (
                <div className="px-3 py-8 text-sm" style={{ color: "var(--color-text-muted)" }}>
                  Nothing found.
                </div>
              ) : (
                options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSelect(option.id)}
                    className="w-full rounded-xl px-3 py-2 text-left transition hover:bg-white/5"
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn("truncate text-sm", option.muted ? "opacity-60" : "")} style={{ color: "var(--color-text)" }}>
                        {option.title}
                      </div>
                      {option.badge ? (
                        <span
                          className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ background: "rgba(255,255,255,0.1)", color: "var(--color-text-muted)" }}
                        >
                          {option.badge}
                        </span>
                      ) : null}
                    </div>
                    {option.description ? (
                      <div className="truncate pt-0.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                        {option.description}
                      </div>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const emptyState: AiModelsPageState = {
  providers: [],
  models: [],
  selectedProvider: null,
  primaryModel: null,
  warning: null,
};

export function AiModelsPanel({ initialState }: { initialState?: AiModelsPageState }) {
  const resolved = initialState ?? emptyState;
  const [data, setData] = useState<AiModelsPageState>(resolved);
  const [loading, setLoading] = useState(!initialState);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(
    resolved.warning ? { tone: "warning", message: resolved.warning } : null,
  );
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(
    resolved.selectedProvider ?? resolved.providers[0]?.id ?? null,
  );
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [providerSearch, setProviderSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [secret, setSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:11434/v1");
  const [testingRuntime, setTestingRuntime] = useState(false);

  const provider = useMemo(
    () => data.providers.find((entry) => entry.id === selectedProvider) ?? null,
    [data.providers, selectedProvider],
  );

  const providerModels = useMemo(() => {
    const normalized = modelSearch.trim().toLowerCase();
    return sortModels(
      data.models.filter((model) => model.providerId === selectedProvider).filter((model) => {
        if (!normalized) return true;
        return `${model.name} ${model.key}`.toLowerCase().includes(normalized);
      }),
    );
  }, [data.models, modelSearch, selectedProvider]);

  const activeModel = useMemo(
    () => data.models.find((model) => model.key === data.primaryModel) ?? null,
    [data.models, data.primaryModel],
  );

  const selectedModelForProvider = useMemo(
    () => providerModels.find((model) => model.key === data.primaryModel) ?? activeModel,
    [activeModel, data.primaryModel, providerModels],
  );

  const providerOptions = useMemo(() => {
    const normalized = providerSearch.trim().toLowerCase();
    return data.providers
      .filter((entry) => {
        if (!normalized) return true;
        return `${entry.name} ${entry.description}`.toLowerCase().includes(normalized);
      })
      .map((entry) => ({
        id: entry.id,
        title: entry.name,
        description: entry.description,
        badge: entry.recommended
          ? "Recommended"
          : entry.popular
            ? "Popular"
            : entry.localModels
              ? "Local models"
              : entry.privacyFirst
                ? "Privacy First"
                : null,
      }));
  }, [data.providers, providerSearch]);

  const modelOptions = useMemo(() => {
    return providerModels.map((model) => ({
      id: model.key,
      title: model.name,
      description: [formatContextWindow(model.contextWindow), model.input.includes("image") ? "vision" : null]
        .filter(Boolean)
        .join(" · "),
      badge: getTierLabel(model),
      muted: !model.available,
    }));
  }, [providerModels]);

  const providerStatusLabel = provider?.configured ? "Connected" : "Not connected";

  const fetchState = useCallback(async (providerId?: ProviderId | null) => {
    setLoading(true);
    try {
      const url = providerId
        ? `/api/settings/ai-models?provider=${encodeURIComponent(providerId)}`
        : "/api/settings/ai-models";
      const response = await fetch(url, { cache: "no-store" });
      const payload = (await response.json()) as AiModelsPageState | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : `Failed to load AI models (${response.status})`);
      }
      setData(payload);
      setSelectedProvider(payload.selectedProvider ?? providerId ?? payload.providers[0]?.id ?? null);
      setNotice(payload.warning ? { tone: "warning", message: payload.warning } : null);
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to load AI Models.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialState) {
      void fetchState();
    }
  }, [initialState, fetchState]);

  const finishMutation = useCallback((state: AiModelsPageState, refresh: RefreshInfo, successMessage: string) => {
    setData(state);
    setSelectedProvider(state.selectedProvider ?? selectedProvider);
    if (refresh.restarted) {
      setNotice({ tone: "success", message: `${successMessage} Gateway reiniciado com sucesso.` });
      return;
    }
    if (refresh.attempted) {
      setNotice({
        tone: "warning",
        message: `${successMessage} O reload do gateway falhou: ${refresh.error ?? "erro desconhecido"}.`,
      });
      return;
    }
    setNotice({ tone: "success", message: successMessage });
  }, [selectedProvider]);

  const handleSaveProvider = useCallback(async () => {
    if (!provider) return;
    if (provider.authType === "oauth") {
      setNotice({
        tone: "warning",
        message: "ChatGPT Subscription ainda depende do fluxo OAuth do OpenClaw CLI.",
      });
      return;
    }
    if (!secret.trim()) {
      setNotice({ tone: "error", message: "Informe a credencial antes de conectar." });
      return;
    }

    setSubmitting(true);
    try {
      const body = provider.authType === "ollama"
        ? { action: "save_ollama", baseUrl: baseUrl.trim(), apiKey: secret.trim() }
        : {
            action: "save_provider",
            providerId: provider.id,
            secret: secret.trim(),
            authType: provider.authType === "setup_token" ? "token" : "api_key",
          };

      const response = await fetch("/api/settings/ai-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { state: AiModelsPageState; refresh: RefreshInfo; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save provider.");
      }
      setSecret("");
      finishMutation(payload.state, payload.refresh, `${provider.name} conectado.`);
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save provider.",
      });
    } finally {
      setSubmitting(false);
    }
  }, [baseUrl, finishMutation, provider, secret]);

  const handleSelectModel = useCallback(async (modelKey: string) => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/settings/ai-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select_model", modelKey }),
      });
      const payload = (await response.json()) as { state: AiModelsPageState; refresh: RefreshInfo; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to select model.");
      }
      const modelName = data.models.find((model) => model.key === modelKey)?.name ?? modelKey;
      finishMutation(payload.state, payload.refresh, `Modelo default trocado para ${modelName}.`);
      setModelMenuOpen(false);
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to select model.",
      });
    } finally {
      setSubmitting(false);
    }
  }, [data.models, finishMutation]);

  const handleTestRuntime = useCallback(async () => {
    setTestingRuntime(true);
    try {
      const response = await fetch("/api/settings/ai-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_runtime" }),
      });
      const payload = (await response.json()) as RuntimeTestResult | { error?: string };
      if (!response.ok || !("ok" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Runtime test failed.");
      }
      if (!payload.ok) {
        throw new Error(payload.error ?? "Runtime test failed.");
      }
      setNotice({
        tone: "success",
        message: `Runtime ok: ${payload.provider ?? "unknown"}/${payload.model ?? "unknown"} respondeu "${payload.text ?? ""}".`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Runtime test failed.",
      });
    } finally {
      setTestingRuntime(false);
    }
  }, []);

  if (loading && data.providers.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--color-text)" }}>AI Models</h1>
        <div className="mt-8 flex items-center gap-2" style={{ color: "var(--color-text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading providers...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <section>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--color-text)" }}>
              AI Models
            </h1>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          {notice ? <NoticeBanner notice={notice} /> : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <Selector
              label="Provider"
              placeholder="Choose provider"
              value={provider?.name ?? null}
              disabled={submitting}
              options={providerOptions}
              search={providerSearch}
              onSearchChange={setProviderSearch}
              open={providerMenuOpen}
              onToggle={() => {
                setProviderMenuOpen((value) => !value);
                setModelMenuOpen(false);
              }}
              onSelect={(id) => {
                setSelectedProvider(id as ProviderId);
                setProviderMenuOpen(false);
                setProviderSearch("");
                setModelSearch("");
              }}
            />

            <Selector
              label="Model"
              placeholder={provider?.configured ? "Choose a model" : "Enter API key to choose a model"}
              value={selectedModelForProvider?.name ?? (data.primaryModel ? normalizeKeyLabel(data.primaryModel.split("/").at(-1) ?? data.primaryModel) : null)}
              badge={getTierLabel(selectedModelForProvider)}
              disabled={submitting || !provider || providerModels.length === 0}
              options={modelOptions}
              search={modelSearch}
              onSearchChange={setModelSearch}
              open={modelMenuOpen}
              onToggle={() => {
                if (!provider || providerModels.length === 0) return;
                setModelMenuOpen((value) => !value);
                setProviderMenuOpen(false);
              }}
              onSelect={(id) => void handleSelectModel(id)}
            />
          </div>

          <div className="border-t pt-8" style={{ borderColor: "var(--color-border)" }}>
            <div className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
              {provider?.authType === "oauth" || provider?.authType === "ollama" ? "Authentication" : "API Key"}
            </div>
            <div className="mt-4 flex items-center gap-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
              {provider?.configured ? (
                <CheckCircle2 className="h-4 w-4 text-neutral-300" />
              ) : (
                <AlertCircle className="h-4 w-4 text-neutral-500" />
              )}
              <span>{providerStatusLabel}</span>
            </div>

            <div className="mt-6 space-y-4">
              {provider?.authType === "ollama" ? (
                <>
                  <input
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    className="h-12 w-full rounded-xl border px-4 text-sm outline-none"
                    style={{
                      borderColor: "var(--color-border)",
                      background: "color-mix(in oklab, var(--color-surface) 92%, black)",
                      color: "var(--color-text)",
                    }}
                    placeholder="http://127.0.0.1:11434/v1"
                  />
                  <input
                    type="password"
                    value={secret}
                    onChange={(event) => setSecret(event.target.value)}
                    className="h-12 w-full rounded-xl border px-4 text-sm outline-none"
                    style={{
                      borderColor: "var(--color-border)",
                      background: "color-mix(in oklab, var(--color-surface) 92%, black)",
                      color: "var(--color-text)",
                    }}
                    placeholder={provider.placeholder ?? ""}
                  />
                </>
              ) : provider?.authType === "oauth" ? null : (
                <input
                  type="password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  className="h-12 w-full rounded-xl border px-4 text-sm outline-none"
                  style={{
                    borderColor: "var(--color-border)",
                    background: "color-mix(in oklab, var(--color-surface) 92%, black)",
                    color: "var(--color-text)",
                  }}
                  placeholder={provider?.authType === "setup_token" ? "API Key or Setup-Token" : provider?.placeholder ?? ""}
                />
              )}

              <button
                type="button"
                onClick={() => void handleSaveProvider()}
                disabled={submitting || !provider}
                className="h-11 w-full rounded-xl border text-sm font-medium transition disabled:opacity-60"
                style={{
                  borderColor: "var(--color-border)",
                  background: "color-mix(in oklab, var(--color-surface) 92%, black)",
                  color: "var(--color-text)",
                }}
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </span>
                ) : provider?.configured ? (
                  "Reconnect"
                ) : (
                  "Connect"
                )}
              </button>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void fetchState(selectedProvider)}
                  disabled={loading || submitting || testingRuntime}
                  className="h-10 rounded-xl border px-3 text-sm transition disabled:opacity-60"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                >
                  {loading ? "Refreshing..." : "Refresh"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleTestRuntime()}
                  disabled={submitting || loading || testingRuntime}
                  className="h-10 rounded-xl border px-3 text-sm transition disabled:opacity-60"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                >
                  {testingRuntime ? "Testing..." : "Test connection"}
                </button>
              </div>

              {provider?.helpText ? (
                <p className="text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
                  {provider.helpText}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
