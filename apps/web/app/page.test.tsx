import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn();
const WorkspaceShell = vi.fn(() => null);

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("./workspace/workspace-content", () => ({ WorkspaceShell }));

describe("Home page routing", () => {
  beforeEach(() => {
    redirect.mockReset();
    WorkspaceShell.mockClear();
  });

  it("keeps Hermes virtual path inside the integrated workspace shell", async () => {
    const { default: Home } = await import("./page");

    const result = await Home({ searchParams: Promise.resolve({ path: "~hermes" }) });

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("still supports the legacy ai-models virtual path inside the integrated workspace shell", async () => {
    const { default: Home } = await import("./page");

    const result = await Home({ searchParams: Promise.resolve({ path: "~ai-models" }) });

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
