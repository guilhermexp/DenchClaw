import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorkspaceSystemPrompt, listWorkspaceSkillPaths } from "./workspace-prompt";

describe("workspace-prompt", () => {
  it("lists workspace skills and injects AGENTS instructions", () => {
    const ws = mkdtempSync(join(tmpdir(), "dench-workspace-"));
    mkdirSync(join(ws, "skills", "crm"), { recursive: true });
    mkdirSync(join(ws, "skills", "gstack"), { recursive: true });
    writeFileSync(join(ws, "skills", "crm", "SKILL.md"), "# CRM", "utf-8");
    writeFileSync(join(ws, "skills", "gstack", "SKILL.md"), "# GSTACK", "utf-8");
    writeFileSync(join(ws, "AGENTS.md"), "Read skills first.", "utf-8");

    expect(listWorkspaceSkillPaths(ws)).toEqual([
      join(ws, "skills", "crm", "SKILL.md"),
      join(ws, "skills", "gstack", "SKILL.md"),
    ]);

    const prompt = buildWorkspaceSystemPrompt(ws);
    expect(prompt).toContain("Mandatory behavior");
    expect(prompt).toContain(join(ws, "skills", "crm", "SKILL.md"));
    expect(prompt).toContain("Workspace AGENTS.md");
    expect(prompt).toContain("Read skills first.");
  });
});
