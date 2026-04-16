"use client";

import { Renderer } from "@openuidev/react-lang";
import { openuiChatLibrary } from "@openuidev/react-ui/genui-lib";

export function OpenUiAssistantRenderer({
  code,
  contextString,
  isStreaming = false,
}: {
  code: string;
  contextString?: string | null;
  isStreaming?: boolean;
}) {
  return (
    <div className="space-y-2" data-testid="openui-assistant-wrapper">
      <div className="openui-chat-surface rounded-2xl overflow-hidden border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3">
        <Renderer
          response={code}
          library={openuiChatLibrary}
          isStreaming={isStreaming}
        />
      </div>
      {contextString ? (
        <details className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-hover)] px-3 py-2 text-xs text-[color:var(--color-text-muted)]">
          <summary className="cursor-pointer select-none">OpenUI context</summary>
          <pre className="mt-2 whitespace-pre-wrap break-all">{contextString}</pre>
        </details>
      ) : null}
    </div>
  );
}
