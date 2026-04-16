// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSidebar } from "./workspace-sidebar";

const push = vi.fn();
const onNavigate = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

vi.mock("./file-manager-tree", () => ({
  FileManagerTree: () => <div data-testid="file-tree" />,
}));

vi.mock("./profile-switcher", () => ({
  ProfileSwitcher: () => <button type="button">Workspace default</button>,
}));

vi.mock("./create-workspace-dialog", () => ({
  CreateWorkspaceDialog: () => null,
}));

vi.mock("../unicode-spinner", () => ({
  UnicodeSpinner: () => null,
}));

vi.mock("./chat-sessions-sidebar", () => ({
  ChatSessionsSidebar: () => null,
}));

describe("WorkspaceSidebar Hermes navigation", () => {
  beforeEach(() => {
    push.mockReset();
    onNavigate.mockReset();
  });

  it("keeps Hermes button inside the integrated workspace navigation handler", async () => {
    const user = userEvent.setup();

    render(
      <WorkspaceSidebar
        tree={[]}
        activePath={null}
        onSelect={() => {}}
        onRefresh={() => {}}
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Hermes" }));

    expect(onNavigate).toHaveBeenCalledWith("ai-models");
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps delegating non-Hermes footer buttons to the parent handler", async () => {
    const user = userEvent.setup();

    render(
      <WorkspaceSidebar
        tree={[]}
        activePath={null}
        onSelect={() => {}}
        onRefresh={() => {}}
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cloud" }));

    expect(onNavigate).toHaveBeenCalledWith("cloud");
    expect(push).not.toHaveBeenCalled();
  });
});
