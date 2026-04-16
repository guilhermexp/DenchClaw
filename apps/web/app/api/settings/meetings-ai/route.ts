import {
  getMeetingsAiSettingsState,
  updateMeetingsAiSettings,
} from "@/lib/meetings-ai-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(getMeetingsAiSettingsState());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load meetings AI settings." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json();
    return Response.json(updateMeetingsAiSettings({
      deepgramApiKey: typeof payload.deepgramApiKey === "string" ? payload.deepgramApiKey : "",
      deepgramModel: typeof payload.deepgramModel === "string" ? payload.deepgramModel : "",
      openRouterApiKey: typeof payload.openRouterApiKey === "string" ? payload.openRouterApiKey : "",
      openRouterModel: typeof payload.openRouterModel === "string" ? payload.openRouterModel : "",
    }));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update meetings AI settings." },
      { status: 400 },
    );
  }
}
