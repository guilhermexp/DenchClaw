import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn();
const getAiModelsState = vi.fn();
const AiModelsShell = vi.fn(() => null);

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/ai-models-settings", () => ({ getAiModelsState }));
vi.mock("../ai-models/ai-models-shell", () => ({ AiModelsShell }));

describe("Hermes settings route", () => {
  beforeEach(() => {
    redirect.mockReset();
    getAiModelsState.mockReset();
    AiModelsShell.mockReset();
  });

  it("redirects the standalone Hermes settings route back into the integrated workspace shell", async () => {
    const { default: HermesSettingsPage } = await import("./page");

    await HermesSettingsPage();

    expect(redirect).toHaveBeenCalledWith("/?path=~hermes");
    expect(getAiModelsState).not.toHaveBeenCalled();
    expect(AiModelsShell).not.toHaveBeenCalled();
  });
});
