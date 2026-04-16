import { describe, expect, it } from "vitest";

import { canRenderCliBannerArt, formatCliBannerLine } from "./banner.js";

describe("banner rendering guards", () => {
  it("skips unicode art when terminal is too narrow for safe rendering", () => {
    expect(canRenderCliBannerArt(80)).toBe(false);
  });

  it("allows unicode art when terminal is wide enough", () => {
    expect(canRenderCliBannerArt(180)).toBe(true);
  });

  it("falls back to a wrapped line when the banner line does not fit", () => {
    const line = formatCliBannerLine("2.5.3", {
      commit: "abcdef0",
      columns: 20,
      richTty: false,
      env: { DENCHCLAW_TAGLINE_INDEX: "0" },
    });

    expect(line.split("\n").length).toBe(2);
    expect(line).toContain("DENCHCLAW 2.5.3");
  });
});
