import { getAiModelsState } from "@/lib/ai-models-settings";
import { AiModelsShell } from "./ai-models-shell";

export const dynamic = "force-dynamic";

export default async function AiModelsSettingsPage() {
  const initialState = await getAiModelsState();

  return <AiModelsShell initialState={initialState} />;
}
