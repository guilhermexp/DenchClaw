import { WorkspaceShell } from "./workspace/workspace-content";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  await searchParams;

  return <WorkspaceShell />;
}
