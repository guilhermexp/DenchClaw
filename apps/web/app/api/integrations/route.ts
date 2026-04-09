import {
  isComposioGatewayAuthError,
  setComposioApiKey,
  validateComposioApiKey,
} from "@/lib/composio";
import { normalizeLockedDenchIntegrations } from "@/lib/integrations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json(normalizeLockedDenchIntegrations().state);
}

type UpdateIntegrationsBody = {
  composioApiKey?: unknown;
};

export async function POST(request: Request) {
  let body: UpdateIntegrationsBody;
  try {
    body = (await request.json()) as UpdateIntegrationsBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.composioApiKey !== "string" || !body.composioApiKey.trim()) {
    return Response.json(
      { error: "Field 'composioApiKey' must be a non-empty string." },
      { status: 400 },
    );
  }

  const trimmedApiKey = body.composioApiKey.trim();

  try {
    await validateComposioApiKey(trimmedApiKey);
  } catch (error) {
    if (isComposioGatewayAuthError(error)) {
      return Response.json(
        {
          error: "Composio API key rejected by gateway. Update it and try again.",
          code: "invalid_api_key",
        },
        { status: 401 },
      );
    }

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to validate Composio API key.",
      },
      { status: 502 },
    );
  }

  return Response.json({
    composio: setComposioApiKey(trimmedApiKey),
  });
}
