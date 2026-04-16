import { getMeetingRawTranscript } from "@/lib/meetings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id?.trim()) {
    return Response.json({ error: "Meeting id is required." }, { status: 400 });
  }

  try {
    const transcript = await getMeetingRawTranscript(id);
    if (!transcript) {
      return Response.json({ error: "Transcript not found." }, { status: 404 });
    }
    return Response.json(transcript);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load transcript." },
      { status: 500 },
    );
  }
}
