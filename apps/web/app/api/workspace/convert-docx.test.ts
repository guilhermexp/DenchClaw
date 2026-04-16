import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("html-to-docx", () => ({
  default: vi.fn(async () => new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])])),
}));

vi.mock("@/lib/workspace", () => ({
  resolveFilesystemPath: vi.fn(),
  isProtectedSystemPath: vi.fn(() => false),
}));

describe("POST /api/workspace/convert-docx", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mock("node:fs", () => ({
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    }));
    vi.mock("html-to-docx", () => ({
      default: vi.fn(async () => new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])])),
    }));
    vi.mock("@/lib/workspace", () => ({
      resolveFilesystemPath: vi.fn(),
      isProtectedSystemPath: vi.fn(() => false),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes converted docx bytes to the resolved destination", async () => {
    const { resolveFilesystemPath } = await import("@/lib/workspace");
    vi.mocked(resolveFilesystemPath).mockReturnValueOnce({
      absolutePath: "/ws/docs/spec.docx",
      kind: "workspaceRelative",
      withinWorkspace: true,
      workspaceRelativePath: "docs/spec.docx",
    });
    const htmlToDocx = (await import("html-to-docx")).default;
    const { writeFileSync: mockWrite, mkdirSync: mockMkdir } = await import("node:fs");
    const { POST } = await import("./convert-docx/route.js");

    const req = new Request("http://localhost/api/workspace/convert-docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "docs/spec.docx",
        html: "<p>Hello</p>",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(htmlToDocx).toHaveBeenCalledWith(
      "<p>Hello</p>",
      undefined,
      expect.objectContaining({
        table: { row: { cantSplit: true } },
        footer: true,
        pageNumber: true,
      }),
    );
    expect(mockMkdir).toHaveBeenCalledWith("/ws/docs", { recursive: true });
    expect(mockWrite).toHaveBeenCalledWith("/ws/docs/spec.docx", expect.any(Buffer));
  });
});
