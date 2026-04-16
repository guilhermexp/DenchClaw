import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  duckdbExecOnFile,
  duckdbPath,
  duckdbQueryOnFile,
  findObjectDir,
  resolveWorkspaceRoot,
  writeObjectYaml,
} from "@/lib/workspace";
import { resolveMeetingsAiRuntimeConfig } from "@/lib/meetings-ai-settings";
import { buildFileLink } from "@/lib/workspace-links";

export class MeetingConfigurationError extends Error {
  readonly missingKey: "DEEPGRAM_API_KEY" | "OPENROUTER_API_KEY";
  constructor(missingKey: "DEEPGRAM_API_KEY" | "OPENROUTER_API_KEY") {
    super(
      `${missingKey} is not configured. Set it in Settings → Meetings AI or in your .env file.`,
    );
    this.name = "MeetingConfigurationError";
    this.missingKey = missingKey;
  }
}

export type MeetingSource = "record" | "import";

export type MeetingStatus =
  | "idle"
  | "recording"
  | "processing"
  | "transcribing"
  | "beautifying"
  | "creating"
  | "finalizing"
  | "ready"
  | "error";

type MeetingObjectDefinition = {
  name: string;
  icon: string;
  description: string;
  displayField: string;
  fields: Array<{
    name: string;
    type: "text" | "number" | "boolean";
  }>;
};

type MeetingEntryRecord = {
  entryId: string;
  createdAt: string | null;
  updatedAt: string | null;
  fields: Record<string, string>;
};

type TranscriptArtifactWord = {
  word: string;
  start: number;
  end: number;
  confidence?: number;
  speaker?: number;
  punctuated_word?: string;
};

type TranscriptArtifactSegment = {
  id: string;
  speaker?: number;
  start: number;
  end: number;
  text: string;
};

type MeetingTranscriptArtifact = {
  version: 1;
  sessionId: string;
  rawText: string;
  words: TranscriptArtifactWord[];
  speakerHints: Array<{ speaker: string; label: string }>;
  segments: TranscriptArtifactSegment[];
  language?: string;
  provider?: string;
  model?: string;
  startedAt: string;
  endedAt?: string;
};

export type FinalizeMeetingUploadResult = {
  meetingId: string;
  audioAssetId: string;
  transcriptAssetId: string | null;
  title: string;
  openHref: string;
  status: MeetingStatus;
};

export type MeetingListItem = {
  meetingId: string;
  title: string;
  status: string;
  durationSeconds: number;
  updatedAt: string | null;
  openHref: string;
};

export type RawTranscriptPayload = {
  meetingId: string;
  transcriptText: string;
  language: string | null;
  provider: string | null;
};

const MEETING_OBJECT = "meetings";
const AUDIO_OBJECT = "meeting_audio_assets";
const TRANSCRIPT_OBJECT = "meeting_transcripts";

const FIELD = {
  title: "Title",
  sessionId: "Session ID",
  status: "Status",
  source: "Source",
  durationSeconds: "Duration Seconds",
  language: "Language",
  filename: "Filename",
  hasTranscript: "Has Transcript",
  audioAssetId: "Audio Asset ID",
  transcriptAssetId: "Transcript Asset ID",
  audioFilePath: "Audio File Path",
  rawTranscriptFallback: "Raw Transcript Fallback",
  errorMessage: "Error Message",
  startedAt: "Started At",
  endedAt: "Ended At",
  mimeType: "Mime Type",
  originalFilename: "Original Filename",
  filePath: "File Path",
  fileSizeBytes: "File Size Bytes",
  parentMeetingId: "Parent Meeting ID",
  provider: "Provider",
  model: "Model",
  rawText: "Raw Text",
  artifactPath: "Artifact Path",
} as const;

function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

function requireWorkspaceRoot(): string {
  const workspaceRoot = resolveWorkspaceRoot();
  if (!workspaceRoot) {
    throw new Error("Workspace root not found.");
  }
  return workspaceRoot;
}

function requireDbPath(): string {
  const dbFile = duckdbPath();
  if (!dbFile) {
    throw new Error("workspace.duckdb not found.");
  }
  return dbFile;
}

function resolveOrCreateDbPath(): string {
  const existing = duckdbPath();
  if (existing) {
    return existing;
  }
  return join(requireWorkspaceRoot(), "workspace.duckdb");
}

function boolString(value: boolean): string {
  return value ? "true" : "false";
}

function fieldValue(record: MeetingEntryRecord, name: string): string | null {
  const value = record.fields[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function createMeetingSessionId(
  now = new Date(),
  suffix = Math.random().toString(36).slice(2, 8),
): string {
  return `meeting_${now.getTime()}_${suffix}`;
}

export function formatMeetingDuration(durationSeconds: number): string {
  const safe = Math.max(0, Math.floor(durationSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function buildMeetingDocumentContent(input: {
  audioFilePath: string;
  beautifiedMarkdown: string;
  rawTranscript: string;
  startedAt: string;
  durationSeconds: number;
  language: string | null;
  source: MeetingSource;
  filename: string | null;
}): string {
  const lines = [
    `[Abrir audio](./${input.audioFilePath})`,
    "",
    input.beautifiedMarkdown.trim(),
    "",
    "---",
    "",
    "## Detalhes da reuniao",
    "",
    `- **Data**: ${input.startedAt}`,
    `- **Duracao**: ${formatMeetingDuration(input.durationSeconds)}`,
    `- **Origem**: ${input.source}`,
  ];

  if (input.language) {
    lines.push(`- **Idioma**: ${input.language}`);
  }
  if (input.filename) {
    lines.push(`- **Arquivo**: ${input.filename}`);
  }

  lines.push(
    "",
    "## Transcricao bruta",
    "",
    input.rawTranscript.trim() || "_Sem transcricao._",
    "",
  );

  return lines.join("\n");
}

export function buildMeetingErrorDocumentContent(input: {
  audioFilePath: string;
  errorMessage: string;
  rawTranscript: string | null;
  startedAt: string;
  durationSeconds: number;
  language: string | null;
  source: MeetingSource;
  filename: string | null;
}): string {
  const lines = [
    "# Erro ao processar reuniao",
    "",
    `[Abrir audio](./${input.audioFilePath})`,
    "",
    `Falha: ${input.errorMessage}`,
    "",
    "---",
    "",
    "## Detalhes da reuniao",
    "",
    `- **Data**: ${input.startedAt}`,
    `- **Duracao**: ${formatMeetingDuration(input.durationSeconds)}`,
    `- **Origem**: ${input.source}`,
  ];

  if (input.language) {
    lines.push(`- **Idioma**: ${input.language}`);
  }
  if (input.filename) {
    lines.push(`- **Arquivo**: ${input.filename}`);
  }

  if (input.rawTranscript?.trim()) {
    lines.push(
      "",
      "## Transcricao bruta",
      "",
      input.rawTranscript.trim(),
    );
  }

  lines.push("");
  return lines.join("\n");
}

export function getMeetingObjectDefinitions(): MeetingObjectDefinition[] {
  return [
    {
      name: MEETING_OBJECT,
      icon: "calendar",
      description: "Meeting notes created from recordings or imported audio.",
      displayField: FIELD.title,
      fields: [
        { name: FIELD.title, type: "text" },
        { name: FIELD.sessionId, type: "text" },
        { name: FIELD.status, type: "text" },
        { name: FIELD.source, type: "text" },
        { name: FIELD.durationSeconds, type: "number" },
        { name: FIELD.language, type: "text" },
        { name: FIELD.filename, type: "text" },
        { name: FIELD.hasTranscript, type: "boolean" },
        { name: FIELD.audioAssetId, type: "text" },
        { name: FIELD.transcriptAssetId, type: "text" },
        { name: FIELD.audioFilePath, type: "text" },
        { name: FIELD.rawTranscriptFallback, type: "text" },
        { name: FIELD.errorMessage, type: "text" },
        { name: FIELD.startedAt, type: "text" },
        { name: FIELD.endedAt, type: "text" },
      ],
    },
    {
      name: AUDIO_OBJECT,
      icon: "mic",
      description: "Audio assets attached to meetings.",
      displayField: FIELD.title,
      fields: [
        { name: FIELD.title, type: "text" },
        { name: FIELD.sessionId, type: "text" },
        { name: FIELD.source, type: "text" },
        { name: FIELD.durationSeconds, type: "number" },
        { name: FIELD.mimeType, type: "text" },
        { name: FIELD.originalFilename, type: "text" },
        { name: FIELD.filePath, type: "text" },
        { name: FIELD.fileSizeBytes, type: "number" },
        { name: FIELD.parentMeetingId, type: "text" },
      ],
    },
    {
      name: TRANSCRIPT_OBJECT,
      icon: "file-text",
      description: "Raw transcript artifacts for meetings.",
      displayField: FIELD.title,
      fields: [
        { name: FIELD.title, type: "text" },
        { name: FIELD.sessionId, type: "text" },
        { name: FIELD.source, type: "text" },
        { name: FIELD.language, type: "text" },
        { name: FIELD.provider, type: "text" },
        { name: FIELD.model, type: "text" },
        { name: FIELD.rawText, type: "text" },
        { name: FIELD.artifactPath, type: "text" },
        { name: FIELD.parentMeetingId, type: "text" },
        { name: FIELD.startedAt, type: "text" },
        { name: FIELD.endedAt, type: "text" },
      ],
    },
  ];
}

function ensureMeetingDirectories(workspaceRoot: string): void {
  mkdirSync(join(workspaceRoot, MEETING_OBJECT), { recursive: true });
  mkdirSync(join(workspaceRoot, AUDIO_OBJECT), { recursive: true });
  mkdirSync(join(workspaceRoot, TRANSCRIPT_OBJECT), { recursive: true });
  mkdirSync(join(workspaceRoot, "meetings", "audio"), { recursive: true });
  mkdirSync(join(workspaceRoot, "meetings", "transcripts"), { recursive: true });
}

function ensureMeetingObjectDirectories(workspaceRoot: string): void {
  for (const definition of getMeetingObjectDefinitions()) {
    const objectDir = join(workspaceRoot, definition.name);
    mkdirSync(objectDir, { recursive: true });
    writeObjectYaml(objectDir, {
      icon: definition.icon,
      default_view: "list",
      display_field: definition.displayField,
      fields: definition.fields.map((field) => ({
        name: field.name,
        type: field.type,
      })),
    });
  }
}

function ensureObjectEntry(dbFile: string, definition: MeetingObjectDefinition): string {
  const existing = duckdbQueryOnFile<{ id: string }>(
    dbFile,
    `SELECT id FROM objects WHERE name = '${sqlEscape(definition.name)}' LIMIT 1`,
  );
  if (existing[0]?.id) {
    return existing[0].id;
  }

  const objectId = randomUUID();
  const ok = duckdbExecOnFile(
    dbFile,
    `INSERT INTO objects (id, name, description, icon, display_field)
     VALUES ('${sqlEscape(objectId)}', '${sqlEscape(definition.name)}', '${sqlEscape(definition.description)}', '${sqlEscape(definition.icon)}', '${sqlEscape(definition.displayField)}')`,
  );
  if (!ok) {
    throw new Error(`Failed to create object '${definition.name}'.`);
  }
  return objectId;
}

function ensureFieldEntries(dbFile: string, objectId: string, definition: MeetingObjectDefinition): void {
  for (const [index, field] of definition.fields.entries()) {
    const existing = duckdbQueryOnFile<{ id: string }>(
      dbFile,
      `SELECT id FROM fields WHERE object_id = '${sqlEscape(objectId)}' AND name = '${sqlEscape(field.name)}' LIMIT 1`,
    );
    if (existing[0]?.id) {
      continue;
    }
    const fieldId = randomUUID();
    const ok = duckdbExecOnFile(
      dbFile,
      `INSERT INTO fields (id, object_id, name, type, required, sort_order)
       VALUES ('${sqlEscape(fieldId)}', '${sqlEscape(objectId)}', '${sqlEscape(field.name)}', '${sqlEscape(field.type)}', false, ${index})`,
    );
    if (!ok) {
      throw new Error(`Failed to create field '${field.name}' for '${definition.name}'.`);
    }
  }
}

export function ensureMeetingSchema(): void {
  const workspaceRoot = requireWorkspaceRoot();
  const dbFile = resolveOrCreateDbPath();

  ensureMeetingDirectories(workspaceRoot);
  ensureMeetingObjectDirectories(workspaceRoot);
  duckdbExecOnFile(
    dbFile,
    "CREATE TABLE IF NOT EXISTS objects (id VARCHAR PRIMARY KEY, name VARCHAR, icon VARCHAR, description VARCHAR, display_field VARCHAR);" +
    "CREATE TABLE IF NOT EXISTS fields (id VARCHAR PRIMARY KEY, object_id VARCHAR, name VARCHAR, type VARCHAR);" +
    "CREATE TABLE IF NOT EXISTS entries (id VARCHAR PRIMARY KEY, object_id VARCHAR, created_at VARCHAR, updated_at VARCHAR);" +
    "CREATE TABLE IF NOT EXISTS entry_fields (entry_id VARCHAR, field_id VARCHAR, value VARCHAR);" +
    "ALTER TABLE objects ADD COLUMN IF NOT EXISTS display_field VARCHAR;",
  );

  for (const definition of getMeetingObjectDefinitions()) {
    const objectId = ensureObjectEntry(dbFile, definition);
    ensureFieldEntries(dbFile, objectId, definition);
  }
}

function getObjectId(dbFile: string, objectName: string): string {
  const rows = duckdbQueryOnFile<{ id: string }>(
    dbFile,
    `SELECT id FROM objects WHERE name = '${sqlEscape(objectName)}' LIMIT 1`,
  );
  const objectId = rows[0]?.id;
  if (!objectId) {
    throw new Error(`Object '${objectName}' not found.`);
  }
  return objectId;
}

function getFieldIdMap(dbFile: string, objectId: string): Map<string, string> {
  const rows = duckdbQueryOnFile<{ id: string; name: string }>(
    dbFile,
    `SELECT id, name FROM fields WHERE object_id = '${sqlEscape(objectId)}'`,
  );
  return new Map(rows.map((row) => [row.name, row.id]));
}

function insertEntry(
  dbFile: string,
  objectName: string,
  values: Record<string, string | number | boolean | null | undefined>,
): string {
  const objectId = getObjectId(dbFile, objectName);
  const entryId = randomUUID();
  const now = new Date().toISOString();

  const ok = duckdbExecOnFile(
    dbFile,
    `INSERT INTO entries (id, object_id, created_at, updated_at)
     VALUES ('${sqlEscape(entryId)}', '${sqlEscape(objectId)}', '${now}', '${now}')`,
  );
  if (!ok) {
    throw new Error(`Failed to create entry for '${objectName}'.`);
  }

  const fieldIdMap = getFieldIdMap(dbFile, objectId);
  for (const [fieldName, rawValue] of Object.entries(values)) {
    if (rawValue == null) {
      continue;
    }
    const fieldId = fieldIdMap.get(fieldName);
    if (!fieldId) {
      continue;
    }
    const value = typeof rawValue === "string" ? rawValue : String(rawValue);
    duckdbExecOnFile(
      dbFile,
      `INSERT INTO entry_fields (entry_id, field_id, value)
       VALUES ('${sqlEscape(entryId)}', '${sqlEscape(fieldId)}', '${sqlEscape(value)}')`,
    );
  }

  return entryId;
}

function updateEntryFields(
  dbFile: string,
  objectName: string,
  entryId: string,
  values: Record<string, string | number | boolean | null | undefined>,
): void {
  const objectId = getObjectId(dbFile, objectName);
  const fieldIdMap = getFieldIdMap(dbFile, objectId);

  for (const [fieldName, rawValue] of Object.entries(values)) {
    const fieldId = fieldIdMap.get(fieldName);
    if (!fieldId) {
      continue;
    }
    const existing = duckdbQueryOnFile<{ cnt: number }>(
      dbFile,
      `SELECT COUNT(*) as cnt
       FROM entry_fields
       WHERE entry_id = '${sqlEscape(entryId)}' AND field_id = '${sqlEscape(fieldId)}'`,
    );

    if (rawValue == null) {
      if ((existing[0]?.cnt ?? 0) > 0) {
        duckdbExecOnFile(
          dbFile,
          `DELETE FROM entry_fields
           WHERE entry_id = '${sqlEscape(entryId)}' AND field_id = '${sqlEscape(fieldId)}'`,
        );
      }
      continue;
    }

    const value = typeof rawValue === "string" ? rawValue : String(rawValue);
    if ((existing[0]?.cnt ?? 0) > 0) {
      duckdbExecOnFile(
        dbFile,
        `UPDATE entry_fields
         SET value = '${sqlEscape(value)}'
         WHERE entry_id = '${sqlEscape(entryId)}' AND field_id = '${sqlEscape(fieldId)}'`,
      );
    } else {
      duckdbExecOnFile(
        dbFile,
        `INSERT INTO entry_fields (entry_id, field_id, value)
         VALUES ('${sqlEscape(entryId)}', '${sqlEscape(fieldId)}', '${sqlEscape(value)}')`,
      );
    }
  }

  duckdbExecOnFile(
    dbFile,
    `UPDATE entries SET updated_at = '${sqlEscape(new Date().toISOString())}' WHERE id = '${sqlEscape(entryId)}'`,
  );
}

function readObjectEntries(dbFile: string, objectName: string): MeetingEntryRecord[] {
  const objectId = getObjectId(dbFile, objectName);
  const rows = duckdbQueryOnFile<{
    entry_id: string;
    created_at: string | null;
    updated_at: string | null;
    field_name: string;
    value: string | null;
  }>(
    dbFile,
    `SELECT e.id as entry_id, e.created_at, e.updated_at, f.name as field_name, ef.value
     FROM entries e
     LEFT JOIN entry_fields ef ON ef.entry_id = e.id
     LEFT JOIN fields f ON f.id = ef.field_id
     WHERE e.object_id = '${sqlEscape(objectId)}'
     ORDER BY e.updated_at DESC`,
  );

  const grouped = new Map<string, MeetingEntryRecord>();
  for (const row of rows) {
    const existing = grouped.get(row.entry_id) ?? {
      entryId: row.entry_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      fields: {},
    };
    if (row.field_name && row.value != null) {
      existing.fields[row.field_name] = row.value;
    }
    grouped.set(row.entry_id, existing);
  }
  return Array.from(grouped.values());
}

function readEntryById(dbFile: string, objectName: string, entryId: string): MeetingEntryRecord | null {
  return readObjectEntries(dbFile, objectName).find((entry) => entry.entryId === entryId) ?? null;
}

function writeLegacyEntryDocument(objectName: string, entryId: string, content: string): string {
  const objectDir = findObjectDir(objectName);
  if (!objectDir) {
    throw new Error(`Object directory not found for '${objectName}'.`);
  }
  const absolutePath = join(objectDir, `${entryId}.md`);
  writeFileSync(absolutePath, content, "utf-8");
  return absolutePath;
}

function buildMeetingDocumentHref(entryId: string): string {
  return buildFileLink(`${MEETING_OBJECT}/${entryId}.md`);
}

function toWorkspaceRelativePath(absolutePath: string): string {
  const workspaceRoot = requireWorkspaceRoot();
  return absolutePath.startsWith(workspaceRoot)
    ? absolutePath.slice(workspaceRoot.length + 1).replace(/\\/g, "/")
    : absolutePath.replace(/\\/g, "/");
}

function sanitizeFileStem(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "meeting";
}

async function persistUploadedAudio(file: File, sessionId: string): Promise<{
  filePath: string;
  absolutePath: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
}> {
  const workspaceRoot = requireWorkspaceRoot();
  const filename = file.name?.trim() || `${sessionId}.webm`;
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : ".webm";
  const safeFilename = `${sessionId}-${sanitizeFileStem(filename.replace(/\.[^.]+$/, ""))}${ext}`;
  const absolutePath = join(workspaceRoot, "meetings", "audio", safeFilename);
  writeFileSync(absolutePath, Buffer.from(await file.arrayBuffer()));
  return {
    filePath: toWorkspaceRelativePath(absolutePath),
    absolutePath,
    mimeType: file.type || "audio/webm",
    sizeBytes: file.size,
    filename,
  };
}

function persistTranscriptArtifact(
  sessionId: string,
  artifact: MeetingTranscriptArtifact,
): { filePath: string; absolutePath: string } {
  const workspaceRoot = requireWorkspaceRoot();
  const absolutePath = join(workspaceRoot, "meetings", "transcripts", `${sessionId}.json`);
  writeFileSync(absolutePath, JSON.stringify(artifact, null, 2) + "\n", "utf-8");
  return {
    filePath: toWorkspaceRelativePath(absolutePath),
    absolutePath,
  };
}

function readTranscriptArtifact(filePath: string): MeetingTranscriptArtifact | null {
  try {
    const workspaceRoot = requireWorkspaceRoot();
    const absolutePath = join(workspaceRoot, filePath);
    return JSON.parse(readFileSync(absolutePath, "utf-8")) as MeetingTranscriptArtifact;
  } catch {
    return null;
  }
}

async function transcribeWithDeepgram(file: File, startedAt: string): Promise<{
  rawText: string;
  language: string | null;
  provider: string;
  model: string;
  words: TranscriptArtifactWord[];
  segments: TranscriptArtifactSegment[];
}> {
  const runtimeConfig = resolveMeetingsAiRuntimeConfig();
  const apiKey = runtimeConfig.deepgramApiKey;
  if (!apiKey) {
    throw new MeetingConfigurationError("DEEPGRAM_API_KEY");
  }

  const model = runtimeConfig.deepgramModel || "nova-3";
  const url = new URL("https://api.deepgram.com/v1/listen");
  url.searchParams.set("model", model);
  url.searchParams.set("language", "multi");
  url.searchParams.set("punctuate", "true");
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("diarize", "true");
  url.searchParams.set("utterances", "true");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: Buffer.from(await file.arrayBuffer()),
  });

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof payload?.err_msg === "string"
      ? payload.err_msg
      : typeof payload?.message === "string"
        ? payload.message
        : `Deepgram request failed (${response.status}).`;
    throw new Error(message);
  }

  const results = payload?.results as Record<string, unknown> | undefined;
  const channels = Array.isArray(results?.channels) ? results.channels as Array<Record<string, unknown>> : [];
  const firstChannel = channels[0];
  const alternatives = Array.isArray(firstChannel?.alternatives)
    ? firstChannel.alternatives as Array<Record<string, unknown>>
    : [];
  const firstAlternative = alternatives[0];
  const rawText = typeof firstAlternative?.transcript === "string" ? firstAlternative.transcript.trim() : "";
  if (!rawText) {
    const metadata = payload?.metadata as Record<string, unknown> | undefined;
    const audioDuration = typeof metadata?.duration === "number" ? metadata.duration : null;
    const hint = audioDuration != null && audioDuration < 1
      ? " (audio duration < 1s — try recording for longer)"
      : " (no speech detected — check mic input and language)";
    throw new Error(`Deepgram returned an empty transcript${hint}.`);
  }

  const language = typeof firstAlternative?.detected_language === "string"
    ? firstAlternative.detected_language
    : typeof firstChannel?.detected_language === "string"
      ? firstChannel.detected_language
      : null;

  const words = Array.isArray(firstAlternative?.words)
    ? (firstAlternative.words as Array<Record<string, unknown>>).map((word) => ({
      word: typeof word.word === "string" ? word.word : "",
      start: typeof word.start === "number" ? word.start : 0,
      end: typeof word.end === "number" ? word.end : 0,
      confidence: typeof word.confidence === "number" ? word.confidence : undefined,
      speaker: typeof word.speaker === "number" ? word.speaker : undefined,
      punctuated_word: typeof word.punctuated_word === "string" ? word.punctuated_word : undefined,
    })).filter((word) => word.word.length > 0)
    : [];

  const utterances = Array.isArray(results?.utterances)
    ? results.utterances as Array<Record<string, unknown>>
    : [];
  const segments = utterances.map((segment, index) => ({
    id: `${startedAt}-${index}`,
    speaker: typeof segment.speaker === "number" ? segment.speaker : undefined,
    start: typeof segment.start === "number" ? segment.start : 0,
    end: typeof segment.end === "number" ? segment.end : 0,
    text: typeof segment.transcript === "string" ? segment.transcript : "",
  })).filter((segment) => segment.text.length > 0);

  return {
    rawText,
    language,
    provider: "deepgram",
    model,
    words,
    segments,
  };
}

async function openRouterChat(messages: Array<{ role: "system" | "user"; content: string }>): Promise<string> {
  const runtimeConfig = resolveMeetingsAiRuntimeConfig();
  const apiKey = runtimeConfig.openRouterApiKey;
  if (!apiKey) {
    throw new MeetingConfigurationError("OPENROUTER_API_KEY");
  }

  const model = runtimeConfig.openRouterModel || "openai/gpt-4o-mini";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages,
    }),
  });

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const error = payload?.error as Record<string, unknown> | undefined;
    const message = typeof error?.message === "string"
      ? error.message
      : typeof payload?.message === "string"
        ? payload.message
        : `OpenRouter request failed (${response.status}).`;
    throw new Error(message);
  }

  const choices = Array.isArray(payload?.choices) ? payload.choices as Array<Record<string, unknown>> : [];
  const firstChoice = choices[0];
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = typeof message?.content === "string" ? message.content.trim() : "";
  if (!content) {
    throw new Error("OpenRouter returned an empty completion.");
  }

  return content;
}

async function beautifyMeetingTranscript(rawTranscript: string, language: string | null): Promise<string> {
  const localeHint = language?.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
  const systemPrompt = localeHint === "pt-BR"
    ? "Voce transforma transcricoes de reunioes em notas detalhadas em Markdown. Use os titulos exatos: ## Resumo, ## Topicos discutidos, ## Decisoes tomadas, ## Acoes, ## Proximos passos. Omita secoes vazias."
    : "You transform meeting transcripts into detailed Markdown notes. Use the exact headings: ## Summary, ## Topics Discussed, ## Decisions Made, ## Action Items, ## Next Steps. Omit empty sections.";

  return openRouterChat([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Idioma do transcript: ${language ?? "unknown"}\n\nTranscript bruto:\n${rawTranscript}`,
    },
  ]);
}

async function generateMeetingTitle(beautifiedMarkdown: string, language: string | null): Promise<string> {
  const excerpt = beautifiedMarkdown.slice(0, 1000);
  const content = await openRouterChat([
    {
      role: "system",
      content: language?.toLowerCase().startsWith("pt")
        ? "Gere um titulo curto de 2 a 6 palavras para uma reuniao. Sem aspas. Sem pontuacao desnecessaria."
        : "Generate a short 2 to 6 word meeting title. No quotes. No unnecessary punctuation.",
    },
    { role: "user", content: excerpt },
  ]);

  return content.split("\n")[0]?.trim().replace(/^["']|["']$/g, "") || fallbackMeetingTitle();
}

function fallbackMeetingTitle(now = new Date()): string {
  return `Meeting ${now.toISOString().slice(0, 16).replace("T", " ")}`;
}

export async function finalizeMeetingUpload(input: {
  file: File;
  source: MeetingSource;
  durationSeconds?: number;
}): Promise<FinalizeMeetingUploadResult> {
  ensureMeetingSchema();
  const dbFile = requireDbPath();

  const sessionId = createMeetingSessionId();
  const startedAt = new Date().toISOString();
  const durationSeconds = Math.max(0, Math.floor(input.durationSeconds ?? 0));
  const persistedAudio = await persistUploadedAudio(input.file, sessionId);

  const audioAssetId = insertEntry(dbFile, AUDIO_OBJECT, {
    [FIELD.title]: input.file.name || "Meeting audio",
    [FIELD.sessionId]: sessionId,
    [FIELD.source]: input.source,
    [FIELD.durationSeconds]: durationSeconds,
    [FIELD.mimeType]: persistedAudio.mimeType,
    [FIELD.originalFilename]: persistedAudio.filename,
    [FIELD.filePath]: persistedAudio.filePath,
    [FIELD.fileSizeBytes]: persistedAudio.sizeBytes,
  });

  const meetingId = insertEntry(dbFile, MEETING_OBJECT, {
    [FIELD.title]: fallbackMeetingTitle(),
    [FIELD.sessionId]: sessionId,
    [FIELD.status]: "transcribing",
    [FIELD.source]: input.source,
    [FIELD.durationSeconds]: durationSeconds,
    [FIELD.filename]: input.source === "import" ? persistedAudio.filename : null,
    [FIELD.hasTranscript]: boolString(false),
    [FIELD.audioAssetId]: audioAssetId,
    [FIELD.audioFilePath]: persistedAudio.filePath,
    [FIELD.startedAt]: startedAt,
  });

  updateEntryFields(dbFile, AUDIO_OBJECT, audioAssetId, {
    [FIELD.parentMeetingId]: meetingId,
  });

  writeLegacyEntryDocument(
    MEETING_OBJECT,
    meetingId,
    buildMeetingDocumentContent({
      audioFilePath: persistedAudio.filePath,
      beautifiedMarkdown: "## Resumo\n\nProcessando transcricao...",
      rawTranscript: "",
      startedAt,
      durationSeconds,
      language: null,
      source: input.source,
      filename: input.source === "import" ? persistedAudio.filename : null,
    }),
  );

  return runTranscriptionPipeline({
    dbFile,
    meetingId,
    audioAssetId,
    audioFile: input.file,
    sessionId,
    startedAt,
    durationSeconds,
    source: input.source,
    audioFilePath: persistedAudio.filePath,
    filenameForDoc: input.source === "import" ? persistedAudio.filename : null,
  });
}

async function runTranscriptionPipeline(args: {
  dbFile: string;
  meetingId: string;
  audioAssetId: string;
  audioFile: File;
  sessionId: string;
  startedAt: string;
  durationSeconds: number;
  source: MeetingSource;
  audioFilePath: string;
  filenameForDoc: string | null;
}): Promise<FinalizeMeetingUploadResult> {
  const { dbFile, meetingId, audioAssetId, audioFile, sessionId, startedAt, durationSeconds, source, audioFilePath, filenameForDoc } = args;
  let transcriptAssetId: string | null = null;

  try {
    const transcript = await transcribeWithDeepgram(audioFile, startedAt);
    updateEntryFields(dbFile, MEETING_OBJECT, meetingId, {
      [FIELD.status]: "beautifying",
      [FIELD.rawTranscriptFallback]: transcript.rawText,
      [FIELD.language]: transcript.language,
    });

    const artifact: MeetingTranscriptArtifact = {
      version: 1,
      sessionId,
      rawText: transcript.rawText,
      words: transcript.words,
      speakerHints: [],
      segments: transcript.segments,
      language: transcript.language ?? undefined,
      provider: transcript.provider,
      model: transcript.model,
      startedAt,
      endedAt: new Date().toISOString(),
    };
    const artifactFile = persistTranscriptArtifact(sessionId, artifact);

    transcriptAssetId = insertEntry(dbFile, TRANSCRIPT_OBJECT, {
      [FIELD.title]: `${fallbackMeetingTitle()} Transcript`,
      [FIELD.sessionId]: sessionId,
      [FIELD.source]: source,
      [FIELD.language]: transcript.language,
      [FIELD.provider]: transcript.provider,
      [FIELD.model]: transcript.model,
      [FIELD.rawText]: transcript.rawText,
      [FIELD.artifactPath]: artifactFile.filePath,
      [FIELD.parentMeetingId]: meetingId,
      [FIELD.startedAt]: startedAt,
      [FIELD.endedAt]: artifact.endedAt,
    });

    const beautified = await beautifyMeetingTranscript(transcript.rawText, transcript.language);
    const title = await generateMeetingTitle(beautified, transcript.language);
    const endedAt = new Date().toISOString();

    writeLegacyEntryDocument(
      MEETING_OBJECT,
      meetingId,
      buildMeetingDocumentContent({
        audioFilePath,
        beautifiedMarkdown: beautified,
        rawTranscript: transcript.rawText,
        startedAt,
        durationSeconds,
        language: transcript.language,
        source,
        filename: filenameForDoc,
      }),
    );

    updateEntryFields(dbFile, MEETING_OBJECT, meetingId, {
      [FIELD.title]: title,
      [FIELD.status]: "ready",
      [FIELD.language]: transcript.language,
      [FIELD.hasTranscript]: boolString(true),
      [FIELD.transcriptAssetId]: transcriptAssetId,
      [FIELD.rawTranscriptFallback]: transcript.rawText,
      [FIELD.endedAt]: endedAt,
      [FIELD.errorMessage]: null,
    });

    return {
      meetingId,
      audioAssetId,
      transcriptAssetId,
      title,
      openHref: buildMeetingDocumentHref(meetingId),
      status: "ready",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meeting processing failed.";
    const fallbackTranscript = transcriptAssetId
      ? fieldValue(readEntryById(dbFile, TRANSCRIPT_OBJECT, transcriptAssetId) ?? {
        entryId: transcriptAssetId,
        createdAt: null,
        updatedAt: null,
        fields: {},
      }, FIELD.rawText)
      : null;

    writeLegacyEntryDocument(
      MEETING_OBJECT,
      meetingId,
      buildMeetingErrorDocumentContent({
        audioFilePath,
        errorMessage: message,
        rawTranscript: fallbackTranscript,
        startedAt,
        durationSeconds,
        language: null,
        source,
        filename: filenameForDoc,
      }),
    );

    updateEntryFields(dbFile, MEETING_OBJECT, meetingId, {
      [FIELD.status]: "error",
      [FIELD.errorMessage]: message,
      [FIELD.transcriptAssetId]: transcriptAssetId,
    });

    return {
      meetingId,
      audioAssetId,
      transcriptAssetId,
      title: fallbackMeetingTitle(),
      openHref: buildMeetingDocumentHref(meetingId),
      status: "error",
    };
  }
}

export async function retryMeetingTranscription(meetingId: string): Promise<FinalizeMeetingUploadResult> {
  ensureMeetingSchema();
  const dbFile = requireDbPath();

  const meeting = readEntryById(dbFile, MEETING_OBJECT, meetingId);
  if (!meeting) {
    throw new Error(`Meeting ${meetingId} not found.`);
  }

  const audioAssetId = fieldValue(meeting, FIELD.audioAssetId);
  if (!audioAssetId) {
    throw new Error("Meeting has no audio asset recorded.");
  }
  const audioAsset = readEntryById(dbFile, AUDIO_OBJECT, audioAssetId);
  if (!audioAsset) {
    throw new Error("Audio asset row missing from database.");
  }

  const audioRelPath = fieldValue(audioAsset, FIELD.filePath) ?? fieldValue(meeting, FIELD.audioFilePath);
  if (!audioRelPath) {
    throw new Error("Audio file path not recorded for this meeting.");
  }
  const workspaceRoot = requireWorkspaceRoot();
  const absoluteAudioPath = join(workspaceRoot, audioRelPath);
  let audioBuffer: Buffer;
  try {
    audioBuffer = readFileSync(absoluteAudioPath);
  } catch {
    throw new Error(`Audio file not found on disk: ${audioRelPath}`);
  }

  const sessionId = fieldValue(meeting, FIELD.sessionId) ?? createMeetingSessionId();
  const startedAt = fieldValue(meeting, FIELD.startedAt) ?? new Date().toISOString();
  const durationSeconds = Number(fieldValue(meeting, FIELD.durationSeconds) ?? "0") || 0;
  const sourceValue = fieldValue(meeting, FIELD.source);
  const source: MeetingSource = sourceValue === "record" ? "record" : "import";
  const originalFilename = fieldValue(audioAsset, FIELD.originalFilename) ?? fieldValue(meeting, FIELD.filename);
  const mimeType = fieldValue(audioAsset, FIELD.mimeType) ?? "audio/webm";

  const audioFile = new File(
    [new Uint8Array(audioBuffer)],
    originalFilename ?? `${sessionId}.webm`,
    { type: mimeType },
  );

  updateEntryFields(dbFile, MEETING_OBJECT, meetingId, {
    [FIELD.status]: "transcribing",
    [FIELD.errorMessage]: null,
  });

  return runTranscriptionPipeline({
    dbFile,
    meetingId,
    audioAssetId,
    audioFile,
    sessionId,
    startedAt,
    durationSeconds,
    source,
    audioFilePath: audioRelPath,
    filenameForDoc: source === "import" ? originalFilename : null,
  });
}

export async function listMeetings(): Promise<MeetingListItem[]> {
  if (!duckdbPath()) {
    return [];
  }
  ensureMeetingSchema();
  const dbFile = requireDbPath();
  return readObjectEntries(dbFile, MEETING_OBJECT)
    .map((entry) => ({
      meetingId: entry.entryId,
      title: fieldValue(entry, FIELD.title) ?? "Untitled meeting",
      status: fieldValue(entry, FIELD.status) ?? "idle",
      durationSeconds: Number(fieldValue(entry, FIELD.durationSeconds) ?? "0") || 0,
      updatedAt: entry.updatedAt,
      openHref: buildMeetingDocumentHref(entry.entryId),
    }))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export async function getMeetingRawTranscript(meetingId: string): Promise<RawTranscriptPayload | null> {
  if (!duckdbPath()) {
    return null;
  }
  ensureMeetingSchema();
  const dbFile = requireDbPath();
  const meeting = readEntryById(dbFile, MEETING_OBJECT, meetingId);
  if (!meeting) {
    return null;
  }

  const transcriptAssetId = fieldValue(meeting, FIELD.transcriptAssetId);
  if (transcriptAssetId) {
    const transcript = readEntryById(dbFile, TRANSCRIPT_OBJECT, transcriptAssetId);
    if (transcript) {
      const artifactPath = fieldValue(transcript, FIELD.artifactPath);
      const artifact = artifactPath ? readTranscriptArtifact(artifactPath) : null;
      return {
        meetingId,
        transcriptText: artifact?.rawText ?? fieldValue(transcript, FIELD.rawText) ?? "",
        language: artifact?.language ?? fieldValue(transcript, FIELD.language),
        provider: artifact?.provider ?? fieldValue(transcript, FIELD.provider),
      };
    }
  }

  const fallback = fieldValue(meeting, FIELD.rawTranscriptFallback);
  if (!fallback) {
    return null;
  }
  return {
    meetingId,
    transcriptText: fallback,
    language: fieldValue(meeting, FIELD.language),
    provider: "fallback",
  };
}
