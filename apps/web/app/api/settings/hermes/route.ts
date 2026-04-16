import { getAiModelsState, updateAiModelsState } from "@/lib/ai-models-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await getAiModelsState());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load Hermes settings." },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    return Response.json(await getAiModelsState());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to refresh Hermes settings." },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const payload = await req.json();
    return Response.json(await updateAiModelsState(payload));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update Hermes settings." },
      { status: 400 },
    );
  }
}
