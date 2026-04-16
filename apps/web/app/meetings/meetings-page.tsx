"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type MeetingItem = {
  meetingId: string;
  title: string;
  status: string;
  durationSeconds: number;
  updatedAt: string | null;
  openHref: string;
};

type RecorderState =
  | "idle"
  | "recording"
  | "processing"
  | "transcribing"
  | "beautifying"
  | "creating"
  | "finalizing"
  | "error";

function formatDuration(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "sem data";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusTone(status: string): { background: string; color: string } {
  const normalized = status.trim().toLowerCase();
  if (normalized === "ready") {
    return {
      background: "color-mix(in srgb, #22c55e 12%, transparent)",
      color: "#22c55e",
    };
  }
  if (normalized === "error") {
    return {
      background: "color-mix(in srgb, #ef4444 12%, transparent)",
      color: "#ef4444",
    };
  }
  if (normalized === "recording") {
    return {
      background: "color-mix(in srgb, #f97316 12%, transparent)",
      color: "#f97316",
    };
  }
  return {
    background: "var(--color-surface-hover)",
    color: "var(--color-text-muted)",
  };
}

export function MeetingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);

  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const refreshMeetings = useCallback(async () => {
    const response = await fetch("/api/meetings/list", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    setMeetings(Array.isArray(payload.meetings) ? payload.meetings : []);
  }, []);

  useEffect(() => {
    void refreshMeetings();
  }, [refreshMeetings]);

  useEffect(() => {
    if (recorderState !== "recording") {
      return;
    }

    const interval = window.setInterval(() => {
      const startedAt = recordingStartedAtRef.current;
      if (!startedAt) return;
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [recorderState]);

  const statusLabel = useMemo(() => {
    switch (recorderState) {
      case "recording":
        return `Recording ${formatDuration(elapsedSeconds)}`;
      case "processing":
        return "Processing audio...";
      case "transcribing":
        return "Transcribing...";
      case "beautifying":
        return "Beautifying notes...";
      case "creating":
        return "Creating meeting note...";
      case "finalizing":
        return "Finalizing...";
      case "error":
        return errorMessage ?? "Failed to process meeting.";
      default:
        return "Start a recording or import audio.";
    }
  }, [elapsedSeconds, errorMessage, recorderState]);

  async function finalizeAudio(file: File, source: "record" | "import", durationSeconds?: number) {
    setErrorMessage(null);
    setRecorderState("transcribing");

    const formData = new FormData();
    formData.set("file", file);
    formData.set("source", source);
    if (typeof durationSeconds === "number") {
      formData.set("durationSeconds", String(durationSeconds));
    }

    try {
      const response = await fetch("/api/meetings/finalize", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Failed to finalize meeting.");
      }
      await refreshMeetings();
      if (typeof payload.openHref === "string" && payload.openHref.length > 0) {
        router.push(payload.openHref);
        return;
      }
      setRecorderState("idle");
    } catch (error) {
      setRecorderState("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to finalize meeting.");
    }
  }

  async function startRecording() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];

    setErrorMessage(null);
    setElapsedSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };
      recorder.start(1000);
      setRecorderState("recording");
    } catch (error) {
      setRecorderState("error");
      setErrorMessage(error instanceof Error ? error.message : "Microphone access failed.");
    }
  }

  async function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      return;
    }

    setRecorderState("processing");

    const stopPromise = new Promise<File>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `meeting-${Date.now()}.webm`, { type: blob.type });
        resolve(file);
      };
    });

    recorder.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;

    const file = await stopPromise;
    const durationSeconds = elapsedSeconds;
    await finalizeAudio(file, "record", durationSeconds);
  }

  async function importAudio(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setRecorderState("processing");
    await finalizeAudio(file, "import");
  }

  return (
    <div
      className={embedded ? "" : "mx-auto max-w-5xl p-6"}
      style={{ color: "var(--color-text)" }}
    >
        <header className="mb-6">
          <h1 className="font-instrument text-3xl tracking-tight" style={{ color: "var(--color-text)" }}>
            Meetings
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            {meetings.length} {meetings.length === 1 ? "meeting" : "meetings"} salvas
          </p>
        </header>

        <section className="mb-6 space-y-4">
          <div
            className="inline-flex flex-wrap items-center gap-1 rounded-2xl p-1"
            style={{ background: "var(--color-surface)" }}
          >
            {recorderState === "recording" ? (
              <button
                type="button"
                onClick={() => void stopRecording()}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: "#dc2626", color: "white" }}
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startRecording()}
                disabled={recorderState !== "idle" && recorderState !== "error"}
                className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
                style={{
                  background: recorderState === "idle" || recorderState === "error"
                    ? "var(--color-bg)"
                    : "transparent",
                  color: "var(--color-text)",
                }}
              >
                Start Recording
              </button>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={recorderState !== "idle" && recorderState !== "error"}
              className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ color: "var(--color-text-muted)" }}
            >
              Import Audio
            </button>

            <button
              type="button"
              onClick={() => void refreshMeetings()}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ color: "var(--color-text-muted)" }}
            >
              Refresh
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.m4a,.ogg,.webm,.flac,.aac"
              className="hidden"
              onChange={(event) => void importAudio(event)}
            />
          </div>

          <div
            className="flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm"
            style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{
                background: recorderState === "recording" ? "#ef4444" : "var(--color-text-muted)",
                opacity: recorderState === "recording" ? 1 : 0.5,
              }}
            />
            <span className="font-medium">{statusLabel}</span>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Deepgram + OpenRouter
            </span>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Live transcript degrada com elegância nesta V1
            </span>
          </div>
        </section>

        {meetings.length === 0 ? (
          <div
            className="rounded-2xl p-6 text-sm"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
          >
            Nenhuma meeting ainda.
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {meetings.map((meeting) => {
              const tone = statusTone(meeting.status);
              return (
                <a
                  key={meeting.meetingId}
                  href={meeting.openHref}
                  className="group rounded-2xl p-5 flex flex-col gap-3 transition-colors"
                  style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          background: "linear-gradient(135deg, rgba(59,130,246,0.22), rgba(34,197,94,0.14))",
                          color: "var(--color-text)",
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M12 2v20" />
                          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H15a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                      </div>

                      <div className="min-w-0">
                        <div className="text-xl font-medium truncate" style={{ color: "var(--color-text)" }}>
                          {meeting.title}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                            Updated {formatUpdatedAt(meeting.updatedAt)}
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 uppercase tracking-wide"
                            style={tone}
                          >
                            {meeting.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                        Duration
                      </div>
                      <div className="text-sm font-medium">{formatDuration(meeting.durationSeconds)}</div>
                    </div>
                  </div>

                  <div
                    className="text-sm leading-6"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Meeting note com áudio, transcript bruto e versão embelezada vinculados como objects.
                  </div>
                </a>
              );
            })}
          </section>
        )}
    </div>
  );
}
