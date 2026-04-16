import { listMeetings } from "@/lib/meetings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const meetings = await listMeetings();
    return Response.json({ meetings });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to list meetings." },
      { status: 500 },
    );
  }
}
