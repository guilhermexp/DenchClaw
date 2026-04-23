"use client";

import type { ActionEvent } from "@openuidev/react-lang";
import { BuiltinActionType, Renderer } from "@openuidev/react-lang";
import { openuiChatLibrary } from "@openuidev/react-ui/genui-lib";
import { useCallback } from "react";

export function OpenUiAssistantRenderer({
  code,
  contextString,
  isStreaming = false,
  onContinueConversation,
}: {
  code: string;
  contextString?: string | null;
  isStreaming?: boolean;
  onContinueConversation?: (message: string) => void;
}) {
  const handleAction = useCallback(
    (event: ActionEvent) => {
      if (
        event.type === BuiltinActionType.ContinueConversation &&
        event.humanFriendlyMessage
      ) {
        onContinueConversation?.(event.humanFriendlyMessage);
        return;
      }

      if (event.type === BuiltinActionType.OpenUrl) {
        const url = event.params?.["url"];
        if (typeof window !== "undefined" && typeof url === "string") {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      }
    },
    [onContinueConversation],
  );

  return (
    <div className="space-y-2" data-testid="openui-assistant-wrapper">
      <div className="openui-chat-surface rounded-2xl overflow-hidden border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3">
        <Renderer
          response={code}
          library={openuiChatLibrary}
          isStreaming={isStreaming}
          onAction={handleAction}
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
