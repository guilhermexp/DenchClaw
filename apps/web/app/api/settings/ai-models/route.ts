import {
  getAiModelsState,
  saveOllamaProvider,
  saveProviderCredential,
  selectPrimaryModel,
  testAiModelsRuntime,
  type AiModelProviderId,
} from "@/lib/ai-models-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PostBody =
  | {
      action: "save_provider";
      providerId?: string;
      secret?: string;
      authType?: "api_key" | "token";
    }
  | {
      action: "save_ollama";
      baseUrl?: string;
      apiKey?: string;
    }
  | {
      action: "select_model";
      modelKey?: string;
    }
  | {
      action: "test_runtime";
    };

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider");
    return Response.json(await getAiModelsState({ provider }));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load AI models settings." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.action === "save_provider") {
    if (typeof body.providerId !== "string" || !body.providerId.trim()) {
      return Response.json({ error: "Field 'providerId' is required." }, { status: 400 });
    }
    if (typeof body.secret !== "string" || !body.secret.trim()) {
      return Response.json({ error: "Field 'secret' is required." }, { status: 400 });
    }
    try {
      return Response.json(await saveProviderCredential({
        providerId: body.providerId.trim() as AiModelProviderId,
        secret: body.secret.trim(),
        authType: body.authType,
      }));
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed to save provider credential." },
        { status: 500 },
      );
    }
  }

  if (body.action === "save_ollama") {
    if (typeof body.baseUrl !== "string" || !body.baseUrl.trim()) {
      return Response.json({ error: "Field 'baseUrl' is required." }, { status: 400 });
    }
    if (typeof body.apiKey !== "string" || !body.apiKey.trim()) {
      return Response.json({ error: "Field 'apiKey' is required." }, { status: 400 });
    }
    try {
      return Response.json(await saveOllamaProvider({
        baseUrl: body.baseUrl.trim(),
        apiKey: body.apiKey.trim(),
      }));
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed to save Ollama provider." },
        { status: 500 },
      );
    }
  }

  if (body.action === "select_model") {
    if (typeof body.modelKey !== "string" || !body.modelKey.trim()) {
      return Response.json({ error: "Field 'modelKey' is required." }, { status: 400 });
    }
    try {
      return Response.json(await selectPrimaryModel(body.modelKey.trim()));
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed to select model." },
        { status: 500 },
      );
    }
  }

  if (body.action === "test_runtime") {
    try {
      return Response.json(await testAiModelsRuntime());
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Failed to run runtime test." },
        { status: 500 },
      );
    }
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
