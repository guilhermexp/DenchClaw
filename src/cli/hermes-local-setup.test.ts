import { describe, expect, it } from "vitest";
import {
  DEFAULT_HERMES_INSTALLER_URL,
  buildHermesInstallerShell,
  mergeHermesConfig,
  resolveRepoAppsWebWorkspace,
} from "./hermes-local-setup.js";

describe("hermes-local-setup", () => {
  it("pins Hermes terminal.cwd to the repo apps/web workspace while preserving existing config", () => {
    const merged = mergeHermesConfig(
      {
        model: {
          default: "gpt-5.4",
          provider: "openai-codex",
        },
        toolsets: ["hermes-cli"],
        terminal: {
          timeout: 180,
        },
      },
      "/tmp/dench/apps/web",
    );

    expect(merged.model).toEqual({
      default: "gpt-5.4",
      provider: "openai-codex",
    });
    expect(merged.toolsets).toEqual(["hermes-cli"]);
    expect(merged.terminal).toEqual({
      timeout: 180,
      cwd: "/tmp/dench/apps/web",
    });
  });

  it("creates a minimal Hermes config when none exists", () => {
    const merged = mergeHermesConfig(null, "/tmp/dench/apps/web");

    expect(merged.toolsets).toEqual(["hermes-cli"]);
    expect(merged.terminal).toEqual({ cwd: "/tmp/dench/apps/web" });
  });

  it("uses the official installer and skips setup only in non-interactive mode", () => {
    expect(buildHermesInstallerShell({ interactive: true })).toContain(DEFAULT_HERMES_INSTALLER_URL);
    expect(buildHermesInstallerShell({ interactive: true })).not.toContain("--skip-setup");
    expect(buildHermesInstallerShell({ interactive: false })).toContain("--skip-setup");
  });

  it("resolves the repo apps/web workspace from the package root", () => {
    expect(resolveRepoAppsWebWorkspace("/tmp/dench")).toBe("/tmp/dench/apps/web");
  });
});
