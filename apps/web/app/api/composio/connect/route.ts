import {
  isComposioGatewayAuthError,
  initiateComposioConnect,
  resolveComposioApiKey,
  resolveComposioEligibility,
  resolveComposioGatewayUrl,
} from "@/lib/composio";
import { resolveComposioConnectToolkitSlug } from "@/lib/composio-normalization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ConnectRequestBody = {
  toolkit?: unknown;
};

export async function POST(request: Request) {
  const apiKey = resolveComposioApiKey();
  if (!apiKey) {
    return Response.json(
      { error: "Composio API key is required.", code: "missing_api_key" },
      { status: 403 },
    );
  }

  const eligibility = resolveComposioEligibility();
  if (!eligibility.eligible) {
    return Response.json(
      {
        error: "Composio API key is required.",
        code: "missing_api_key",
        lockReason: eligibility.lockReason,
        lockBadge: eligibility.lockBadge,
      },
      { status: 403 },
    );
  }

  let body: ConnectRequestBody;
  try {
    body = (await request.json()) as ConnectRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.toolkit !== "string" || !body.toolkit.trim()) {
    return Response.json(
      { error: "Field 'toolkit' must be a non-empty string." },
      { status: 400 },
    );
  }

  const origin = new URL(request.url).origin;
  const callbackUrl = `${origin}/api/composio/callback`;
  const gatewayUrl = resolveComposioGatewayUrl();
  const requestedToolkit = body.toolkit.trim();
  const connectToolkit = resolveComposioConnectToolkitSlug(requestedToolkit);

  try {
    const data = await initiateComposioConnect(
      gatewayUrl,
      apiKey,
      connectToolkit,
      callbackUrl,
    );
    return Response.json({
      ...data,
      requested_toolkit: requestedToolkit,
      connect_toolkit: connectToolkit,
    });
  } catch (err) {
    if (isComposioGatewayAuthError(err)) {
      return Response.json(
        {
          error: "Composio API key rejected by gateway. Update it and try again.",
          code: "invalid_api_key",
        },
        { status: 401 },
      );
    }

    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to initiate connection." },
      { status: 502 },
    );
  }
}
