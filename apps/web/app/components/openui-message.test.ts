import { describe, expect, it } from "vitest";
import {
  looksLikeOpenUiProgram,
  splitOpenUiContentAndContext,
} from "./openui-message";

describe("openui-message", () => {
  it("detects OpenUI programs with a root assignment", () => {
    expect(
      looksLikeOpenUiProgram(
        'root = Card([title])\ntitle = TextContent("Hello")',
      ),
    ).toBe(true);
  });

  it("does not mistake markdown for OpenUI", () => {
    expect(looksLikeOpenUiProgram("# Hello\n\nThis is markdown.")).toBe(false);
  });

  it("splits detached context from OpenUI code", () => {
    expect(
      splitOpenUiContentAndContext(
        'root = Card([title])\ntitle = TextContent("Hello")\n<context>{"foo":"bar"}</context>',
      ),
    ).toEqual({
      content: 'root = Card([title])\ntitle = TextContent("Hello")',
      contextString: '{"foo":"bar"}',
    });
  });
});
