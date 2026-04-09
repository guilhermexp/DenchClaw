"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceSidebar } from "@/app/components/workspace/workspace-sidebar";
import { AiModelsPanel, type AiModelsPageState } from "@/app/components/settings/ai-models-panel";

export function AiModelsShell({ initialState }: { initialState: AiModelsPageState }) {
  const router = useRouter();

  const handleNavigate = useCallback((target: "cloud" | "ai-models" | "integrations" | "skills" | "cron") => {
    if (target === "ai-models") {
      router.push("/settings/ai-models");
      return;
    }
    if (target === "integrations") {
      router.push("/?path=~integrations");
      return;
    }
    if (target === "cloud") {
      router.push("/?path=~cloud");
      return;
    }
    if (target === "skills") {
      router.push("/?path=~skill-store");
      return;
    }
    router.push("/?path=~cron");
  }, [router]);

  return (
    <div className="flex h-screen" style={{ background: "var(--color-main-bg)" }}>
      <div className="flex shrink-0 flex-col border-r" style={{ width: 260, minWidth: 260, borderColor: "var(--color-border)" }}>
        <WorkspaceSidebar
          tree={[]}
          activePath="~ai-models"
          onSelect={() => {}}
          onRefresh={() => {}}
          loading={false}
          onGoToChat={() => router.push("/")}
          onNavigate={handleNavigate}
          activeTab="files"
          onTabChange={() => {}}
          width={260}
        />
      </div>

      <main className="min-w-0 flex-1 overflow-auto" style={{ background: "var(--color-surface)" }}>
        <div className="mx-auto max-w-5xl p-6 md:p-8">
          <AiModelsPanel initialState={initialState} />
        </div>
      </main>
    </div>
  );
}
