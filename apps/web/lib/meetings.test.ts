import { describe, expect, it } from "vitest";

import {
  buildMeetingDocumentContent,
  buildMeetingErrorDocumentContent,
  createMeetingSessionId,
  formatMeetingDuration,
  getMeetingObjectDefinitions,
} from "./meetings";

describe("meetings helpers", () => {
  it("formats duration as mm:ss for short calls", () => {
    expect(formatMeetingDuration(125)).toBe("2m 05s");
  });

  it("formats duration as hh:mm:ss for long calls", () => {
    expect(formatMeetingDuration(3671)).toBe("1h 01m 11s");
  });

  it("creates a stable session id format", () => {
    const sessionId = createMeetingSessionId(
      new Date("2026-04-16T10:11:12.000Z"),
      "abc123",
    );

    expect(sessionId).toBe("meeting_1776334272000_abc123");
  });

  it("builds the final meeting document with summary, details and raw transcript", () => {
    const content = buildMeetingDocumentContent({
      audioFilePath: "meetings/audio/meeting.webm",
      beautifiedMarkdown: "## Resumo\n\nDiscussao principal.",
      rawTranscript: "linha 1\nlinha 2",
      startedAt: "2026-04-16T10:00:00.000Z",
      durationSeconds: 125,
      language: "pt-BR",
      source: "record",
      filename: null,
    });

    expect(content).toContain("[Abrir audio](./meetings/audio/meeting.webm)");
    expect(content).toContain("## Resumo");
    expect(content).toContain("## Detalhes da reuniao");
    expect(content).toContain("- **Duracao**: 2m 05s");
    expect(content).toContain("## Transcricao bruta");
    expect(content).toContain("linha 1");
  });

  it("builds an auditable error document when pipeline fails", () => {
    const content = buildMeetingErrorDocumentContent({
      audioFilePath: "meetings/audio/fail.webm",
      errorMessage: "Deepgram unavailable",
      rawTranscript: "fallback parcial",
      startedAt: "2026-04-16T10:00:00.000Z",
      durationSeconds: 30,
      language: null,
      source: "import",
      filename: "call.m4a",
    });

    expect(content).toContain("# Erro ao processar reuniao");
    expect(content).toContain("Deepgram unavailable");
    expect(content).toContain("[Abrir audio](./meetings/audio/fail.webm)");
    expect(content).toContain("fallback parcial");
    expect(content).toContain("call.m4a");
  });

  it("declares the three required meeting objects", () => {
    const definitions = getMeetingObjectDefinitions();
    expect(definitions.map((entry) => entry.name)).toEqual([
      "meetings",
      "meeting_audio_assets",
      "meeting_transcripts",
    ]);
  });
});
