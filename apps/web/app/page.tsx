import { redirect } from "next/navigation";
import { WorkspaceShell } from "./workspace/workspace-content";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const params = await searchParams;

  if (params.path === "~ai-models") {
    redirect("/settings/ai-models");
  }

  return <WorkspaceShell />;
}
