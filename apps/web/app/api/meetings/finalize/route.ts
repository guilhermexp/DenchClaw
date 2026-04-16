import { finalizeMeetingUpload, MeetingConfigurationError, type MeetingSource } from "@/lib/meetings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseSource(value: FormDataEntryValue | null): MeetingSource {
  return value === "record" ? "record" : "import";
}

function parseDurationSeconds(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }

  const uploaded = formData.get("file");
  if (!(uploaded instanceof File)) {
    return Response.json({ error: "Field 'file' is required." }, { status: 400 });
  }

  try {
    const result = await finalizeMeetingUpload({
      file: uploaded,
      source: parseSource(formData.get("source")),
      durationSeconds: parseDurationSeconds(formData.get("durationSeconds")),
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof MeetingConfigurationError) {
      return Response.json(
        { error: error.message, missingKey: error.missingKey },
        { status: 412 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to finalize meeting." },
      { status: 500 },
    );
  }
}
