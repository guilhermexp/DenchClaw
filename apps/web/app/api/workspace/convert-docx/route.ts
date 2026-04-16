import htmlToDocx from "html-to-docx";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isProtectedSystemPath, resolveFilesystemPath } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DOCX_OPTIONS = {
  table: { row: { cantSplit: true } },
  footer: true,
  pageNumber: true,
} as const;

export async function POST(req: Request) {
  let body: { path?: unknown; html?: unknown };
  try {
    body = (await req.json()) as { path?: unknown; html?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const relPath = typeof body.path === "string" ? body.path : "";
  const html = typeof body.html === "string" ? body.html : "";

  if (!relPath) {
    return Response.json({ error: "Missing 'path' field" }, { status: 400 });
  }

  if (!html.trim()) {
    return Response.json({ error: "Missing 'html' field" }, { status: 400 });
  }

  const targetPath = resolveFilesystemPath(relPath, { allowMissing: true });
  if (isProtectedSystemPath(targetPath)) {
    return Response.json({ error: "Cannot modify system file" }, { status: 403 });
  }

  if (!targetPath) {
    return Response.json(
      { error: "Invalid path or path traversal rejected" },
      { status: 400 },
    );
  }

  try {
    const docxBlob = await htmlToDocx(html, undefined, DOCX_OPTIONS);
    const buffer = Buffer.from(await docxBlob.arrayBuffer());
    mkdirSync(dirname(targetPath.absolutePath), { recursive: true });
    writeFileSync(targetPath.absolutePath, buffer);
    return Response.json({ ok: true, path: relPath });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "DOCX conversion failed" },
      { status: 500 },
    );
  }
}
