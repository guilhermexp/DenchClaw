import { MeetingConfigurationError, retryMeetingTranscription } from "@/lib/meetings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const result = await retryMeetingTranscription(id);
    return Response.json(result);
  } catch (error) {
    if (error instanceof MeetingConfigurationError) {
      return Response.json(
        { error: error.message, missingKey: error.missingKey },
        { status: 412 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to retry transcription." },
      { status: 500 },
    );
  }
}
