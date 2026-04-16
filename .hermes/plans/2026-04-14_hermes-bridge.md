# HermesBridge: Remover OpenClaw e Integrar com Hermes

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Substituir toda dependencia do OpenClaw por um HermesBridge que permite ao dashboard DenchClaw usar o Hermes como backend de AI agent, mantendo o dashboard Next.js funcional.

**Architecture:** Criar adapter layer (`apps/web/lib/hermes-bridge/`) que fala com Hermes API via HTTP/SSE, mantendo a mesma interface SSE que o frontend espera. O chat route e adaptado para usar o HermesBridge em vez do OpenClaw gateway. O CLI bootstrap e simplificado para nao depender do binario `openclaw`.

**Tech Stack:** Next.js API Routes, Hermes API (OpenAI-compatible), SSE streaming, TypeScript

---

## Visao Geral das Fases

- **Fase 0**: Criar tipos do Plugin SDK localmente (elimina import de `openclaw/plugin-sdk`)
- **Fase 1**: Criar HermesBridge core (client, config, agent-runner, active-runs)
- **Fase 2**: Adaptar API Routes do dashboard (chat, stream, stop, sessions)
- **Fase 3**: Remover dependencias OpenClaw do CLI e bootstrap
- **Fase 4**: Adaptar Extensions para usar o novo SDK
- **Fase 5**: Cleanup (remover peer dependency, renomear state dir, atualizar docs)

---

## Fase 0: Plugin SDK Types Locais

### Task 0.1: Criar src/plugin-sdk/index.ts

**Objective:** Eliminar o import de `openclaw/plugin-sdk` criando tipos locais.

**Files:**
- Create: `src/plugin-sdk/index.ts`
- Create: `src/plugin-sdk/account-id.ts`

**Step 1: Criar src/plugin-sdk/index.ts**

```typescript
// DenchClaw Plugin SDK - local types replacing openclaw/plugin-sdk

export type AnyAgentTool = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  execute?: (args: Record<string, unknown>) => Promise<unknown>;
};

export type OpenClawPluginApi = {
  registerTool: (tool: AnyAgentTool) => void;
  onAgentStart?: (callback: (context: AgentContext) => void) => void;
  onAgentEnd?: (callback: (context: AgentContext) => void) => void;
  config: Record<string, unknown>;
  stateDir: string;
  agentId: string;
};

export type AgentContext = {
  agentId: string;
  sessionId: string;
  workspaceDir: string;
};
```

**Step 2: Criar src/plugin-sdk/account-id.ts**

```typescript
export function resolveAccountId(config?: Record<string, unknown>): string | undefined {
  if (config?.accountId && typeof config.accountId === "string") {
    return config.accountId;
  }
  return undefined;
}
```

**Step 3: Verificar build**

```bash
pnpm build
```

**Verification:** Build passa sem erros de tipo de `openclaw/plugin-sdk`.

---

## Fase 1: Hermes Bridge Core

### Task 1.1: Criar Hermes API Client

**Objective:** Cliente HTTP reutilizavel para a Hermes API (formato OpenAI-compatible).

**Files:**
- Create: `apps/web/lib/hermes-bridge/client.ts`

Interface principal:

```typescript
export class HermesClient {
  async chat(request: HermesChatRequest): Promise<HermesChatResponse>
  async *chatStream(request: HermesChatRequest): AsyncGenerator<HermesStreamChunk>
  async listModels(): Promise<Array<{ id: string; name: string }>>
}
```

- `resolveHermesBaseUrl()` - resolve `HERMES_API_URL` ou `http://localhost:21321` (dev) / `21322` (prod)
- Suporta streaming SSE (formato OpenAI `data: {...}\n\n`)
- Suporta tool calls no formato OpenAI function calling

**Verification:** Client compila e pode ser importado.

---

### Task 1.2: Config do State Dir

**Objective:** Gerenciar config com novo formato, migrando do legado.

**Files:**
- Create: `apps/web/lib/hermes-bridge/config.ts`

- `resolveHermesStateDir()` -> `~/.denchclaw` (novo) ou `~/.openclaw-dench` (legacy fallback)
- `readConfig()` / `writeConfig()` -> `denchclaw.json`
- `migrateFromLegacyConfig()` -> copia config de `~/.openclaw-dench/openclaw.json`

**Verification:** Config le/escreve corretamente.

---

### Task 1.3: Hermes Agent Runner

**Objective:** Substituir o `agent-runner.ts` por um que fala com Hermes.

**Files:**
- Create: `apps/web/lib/hermes-bridge/agent-runner.ts`

**Interface principal:**

```typescript
export class HermesAgentRunner extends EventEmitter {
  async *run(options: HermesRunOptions): AsyncGenerator<HermesRunEvent>
  abort(): void
  get isRunning(): boolean
}
```

**Fluxo:**
1. Recebe mensagem do usuario + contexto (workspace, system prompt)
2. Monta mensagens no formato OpenAI chat completions
3. Chama Hermes API com streaming
4. Emite eventos no formato SSE compativel com o dashboard:
   - `lifecycle` (start, final, end)
   - `text-delta` (streaming de texto)
   - `tool-invocation` (chamadas de tools)
   - `error`
5. Suporta abort via AbortController

**Key detail:** O Hermes ja suporta OpenAI-compatible chat completions API com streaming. Nao precisa de WebSocket - HTTP com SSE e suficiente e mais simples.

**Verification:** Runner pode iniciar um run e emitir eventos.

---

### Task 1.4: Hermes Active Runs

**Objective:** Gerencia runs ativos, mantendo interface compativel com o dashboard.

**Files:**
- Create: `apps/web/lib/hermes-bridge/active-runs.ts`

**Interface principal (mesma assinatura do active-runs.ts original):**

```typescript
export function getActiveRun(sessionId: string): HermesActiveRun | undefined
export function hasActiveRun(sessionId: string): boolean
export function getRunningSessionIds(): string[]
export async function startHermesRun(options): Promise<HermesActiveRun>
export function subscribeToRun(sessionId, callback, options?): (() => void) | null
export function abortRun(sessionId: string): void
```

**Key details:**
- Usa `globalThis` Map para sobreviver a HMR (mesmo padrao do original)
- Buffer de eventos para replay (reconect)
- Fan-out para multiplos subscribers
- Persiste mensagens em `.jsonl` no `webChatDir()`
- Suporta subagent runs (subscribe-only)

**Verification:** Runs podem ser iniciados, subscrevidos, e completados.

---

## Fase 2: Adaptar API Routes

### Task 2.1: Adaptar chat route (POST /api/chat)

**Objective:** Usar HermesBridge em vez do OpenClaw gateway.

**Files:**
- Modify: `apps/web/app/api/chat/route.ts`

**Changes:**
1. Importar de `hermes-bridge/active-runs` em vez de `active-runs`
2. Substituir `startRun()` por `startHermesRun()`
3. Substituir `getActiveRun()`, `hasActiveRun()`, `subscribeToRun()` pelas versoes Hermes
4. Remover logica de `openai_unsafe_switch` (modelo vem do Hermes agora)
5. Remover `extractImageAttachmentsFromMessage` se Hermes nao suportar ainda (ou adaptar)

**Verification:** Chat POST inicia run Hermes e retorna SSE stream.

---

### Task 2.2: Adaptar stream route (GET /api/chat/stream)

**Objective:** Reconnect a runs ativos via HermesBridge.

**Files:**
- Modify: `apps/web/app/api/chat/stream/route.ts`

**Changes:**
1. Importar de `hermes-bridge/active-runs`
2. Manter mesma logica de replay e keepalive

**Verification:** Stream reconecta e replays eventos.

---

### Task 2.3: Adaptar stop route (POST /api/chat/stop)

**Objective:** Abort run via HermesBridge.

**Files:**
- Modify: `apps/web/app/api/chat/stop/route.ts`

**Changes:**
1. Importar `abortRun` de `hermes-bridge/active-runs`

**Verification:** Stop aborta o run corretamente.

---

### Task 2.4: Adaptar sessions routes

**Objective:** Sessions continuam funcionando com o novo state dir.

**Files:**
- Modify: `apps/web/app/api/web-sessions/route.ts`
- Modify: `apps/web/app/api/web-sessions/[id]/route.ts`
- Modify: `apps/web/app/api/web-sessions/[id]/messages/route.ts`

**Changes:**
- Usar `resolveHermesStateDir()` em vez de `resolveOpenClawStateDir()` (via workspace.ts que vai ser atualizado)

**Verification:** Sessions CRUD continua funcionando.

---

### Task 2.5: Adaptar workspace routes

**Objective:** Workspace routes usam novo state dir.

**Files:**
- Modify: `apps/web/app/api/workspace/init/route.ts`
- Modify: `apps/web/app/api/workspace/tree/route.ts`
- Modify: `apps/web/app/api/workspace/file/route.ts`
- Modify: `apps/web/app/api/workspace/context/route.ts`
- All other workspace API routes

**Changes:**
-workspace.ts functions (`resolveOpenClawStateDir`, etc.) continuam iguais por enquanto, so o state dir real muda

**Verification:** Workspace CRUD funciona.

---

## Fase 3: Remover Dependencias OpenClaw CLI

### Task 3.1: Simplificar bootstrap

**Objective:** Remover toda a logica de instalar/detectar o binario `openclaw`.

**Files:**
- Modify: `src/cli/bootstrap-external.ts`

**Changes:**
1. Remover `ensureOpenClawCliOnPath()` e toda logica de detectar binario `openclaw`
2. Remover `checkOpenClawCliAvailability()` 
3. Remover `runOpenClawCommand()` e todas as funcoes que fazem spawn do `openclaw`
4. Remover `installOpenClawCli()`
5. Simplificar o bootstrap para:
   - Verificar se Hermes esta rodando (HTTP health check)
   - Configurar state dir
   - Iniciar web runtime
   - Configurar Dench Cloud API key (opcional)

**Verification:** `denchclaw bootstrap` funciona sem binario `openclaw`.

---

### Task 3.2: Simplificar run-main.ts

**Objective:** Remover `ensureOpenClawCliOnPath` do entry point.

**Files:**
- Modify: `src/cli/run-main.ts`

**Changes:**
- Remover import e chamada de `ensureOpenClawCliOnPath`
- Substituir por `ensureHermesAvailable()` que faz health check HTTP

**Verification:** `denchclaw` CLI inicia sem openclaw.

---

### Task 3.3: Atualizar path-env.ts

**Objective:** Remover logica de encontrar binario `openclaw`.

**Files:**
- Modify: `src/infra/path-env.ts`

**Changes:**
- Renomear `ensureOpenClawCliOnPath` para `ensureHermesOnPath` ou simplesmente remover
- Remover referencia ao binario `openclaw`

**Verification:** Build passa.

---

### Task 3.4: Atualizar config/paths.ts

**Objective:** Renomear constantes e funcoes referenciando openclaw.

**Files:**
- Modify: `src/config/paths.ts`

**Changes:**
- Manter `resolveStateDir()` funcionando, mas com novo nome de dirname `.denchclaw`
- Adicionar fallback para `.openclaw-dench` (legacy compat)

**Verification:** Config resolve state dir corretamente.

---

## Fase 4: Adaptar Extensions

### Task 4.1: Atualizar extensions para usar tipos locais

**Objective:** Extensions importam de `../plugin-sdk` local em vez de `openclaw/plugin-sdk`.

**Files:**
- Modify: `extensions/dench-identity/index.ts`
- Modify: `extensions/dench-ai-gateway/composio-bridge.ts`
- Modify: `extensions/apollo-enrichment/index.ts`
- Modify: `extensions/exa-search/index.ts`

**Changes:**
- Trocar `import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk"`
- Por: `import type { AnyAgentTool, OpenClawPluginApi } from "../../../src/plugin-sdk/index.js"`
- Ou manter o tsconfig alias que ja mapeia para local

**Verification:** Extensions buildam sem erros.

---

### Task 4.2: Renomear openclaw.plugin.json para denchclaw.plugin.json

**Objective:** Nomenclatura consistente.

**Files:**
- Rename: `extensions/*/openclaw.plugin.json` -> `extensions/*/denchclaw.plugin.json`
- Update references no codigo que leem esses JSONs

**Verification:** Plugins carregam com novo nome.

---

## Fase 5: Cleanup

### Task 5.1: Remover peer dependency do openclaw

**Objective:** package.json nao depende mais de openclaw.

**Files:**
- Modify: `package.json`

**Changes:**
```diff
- "peerDependencies": {
-   "openclaw": ">=2026.1.0"
- },
```

**Verification:** `pnpm install` funciona sem openclaw instalado.

---

### Task 5.2: Atualizar workspace.ts

**Objective:** Remover dependencia de `resolveOpenClawStateDir`.

**Files:**
- Modify: `apps/web/lib/workspace.ts`

**Changes:**
- `resolveOpenClawStateDir()` continua existindo (para nao quebrar tudo)
- Internamente aponta para `~/.denchclaw` (novo) ou `~/.openclaw-dench` (legacy)
- Adicionar comentario que sera removido futuramente

**Verification:** Workspace resolve state dir.

---

### Task 5.3: Atualizar dench-identity system prompt

**Objective:** Remover referencias a OpenClaw no prompt do agente.

**Files:**
- Modify: `extensions/dench-identity/index.ts`

**Changes:**
- Substituir "running on top of OpenClaw" por "powered by Hermes"
- Remover ou adaptar referencias a `.openclaw/web-chat/`

**Verification:** System prompt do agente nao menciona OpenClaw.

---

### Task 5.4: Atualizar env vars e constantes

**Objective:** Renomear variaveis de ambiente e constantes.

**Files:**
- Modify: `src/infra/env.ts`
- Modify: `src/version.ts`
- Modify: `src/cli/profile.ts`
- Modify: `apps/web/next.config.ts`

**Changes:**
- `OPENCLAW_NO_RESPAWN` -> `DENCHCLAW_NO_RESPAWN` (manter fallback para compat)
- `OPENCLAW_NODE_OPTIONS_READY` -> `DENCHCLAW_NODE_OPTIONS_READY`
- `OPENCLAW_STATE_DIR` -> `DENCHCLAW_STATE_DIR`
- `OPENCLAW_VERSION` -> `DENCHCLAW_VERSION`
- Remover `resolveRuntimeServiceVersion` que le de `OPENCLAW_VERSION`
- Em `next.config.ts`: remover `NEXT_PUBLIC_OPENCLAW_VERSION` ou renomear

**Verification:** Build e runtime funcionam com novas env vars.

---

### Task 5.5: Atualizar logging e tmp dir

**Objective:** Renomear referencias em logging.

**Files:**
- Modify: `src/logging/logger.ts`
- Modify: `src/infra/tmp-openclaw-dir.ts`

**Changes:**
- `openclaw.log` -> `denchclaw.log`
- `/tmp/openclaw` -> `/tmp/denchclaw`
- Manter fallback para legacy

**Verification:** Logs vao para novo path.

---

### Task 5.6: Atualizar documentacao

**Objective:** README e docs refletem Hermes.

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md` (adicionar entrada)
- Modify: `TELEMETRY.md`

**Changes:**
- Remover instrucoes `openclaw --profile dench`
- Adicionar instrucoes de setup com Hermes
- Atualizar state dir para `~/.denchclaw`

**Verification:** Docs refletem nova arquitetura.

---

## Arquivos que NAO precisam mudar

Estes arquivos usam `resolveOpenClawStateDir()` e `resolveWorkspaceRoot()` que continuam funcionando:
- `apps/web/app/api/workspace/*` - todos os routes (workspace CRUD)
- `apps/web/app/components/*` - componentes React
- `apps/web/lib/composio*.ts` - integracao Composio (independente do gateway)
- `apps/web/lib/chat-tabs.ts` - tabs de chat
- `apps/web/lib/search-index.ts` - search
- `apps/web/lib/prompt-suggestions.ts` - suggestions
- `skills/` - skills sao arquivos SKILL.md estaticos

## Ordem de Execucao Recomendada

1. Fase 0 (Plugin SDK) - 15 min
2. Fase 1 (Hermes Bridge Core) - 1-2h
3. Fase 2 (API Routes) - 30 min
4. Fase 5.2 (workspace.ts state dir) - 15 min
5. Fase 3 (CLI cleanup) - 30 min
6. Fase 4 (Extensions) - 30 min
7. Fase 5 (Cleanup restante) - 30 min

**Total estimado:** 3-4h de implementacao focada.

## Riscos e Tradeoffs

1. **Hermes API compatibility**: Assumimos que Hermes suporta OpenAI-compatible chat completions com streaming e function calling. Se nao, precisamos adaptar o client.

2. **Subagent support**: O dashboard tem suporte a subagents via OpenClaw gateway. Hermes suporta subagents via `delegate_task`. Precisamos mapear isso.

3. **Tool execution**: No OpenClaw, tools rodam dentro do gateway. No Hermes, tools rodam no Hermes agent. O dashboard so precisa receber os resultados - a compatibilidade e boa.

4. **State dir migration**: Manter fallback para `~/.openclaw-dench` garante que usuarios existentes nao perdem dados.

5. **Extensions como plugins**: O sistema de extensions do OpenClaw e mais sofisticado que Hermes skills. Por enquanto, as extensions viram codigos estaticos que registram tools no agente.
