# Changelog

Registro prático do fork `guilhermexp/DenchClaw`.

Objetivo:
- manter a trilha das customizações do fork
- registrar mudanças relevantes de produto e infra
- evitar perder contexto entre ajustes locais, sync com upstream e features novas

Observação:
- este arquivo consolida o histórico visível do fork e o estado atual do working tree
- o remoto `upstream` não está com merge-base utilizável no clone atual, então este documento serve como fonte manual de continuidade

## Unreleased

### AI Models no web
- adicionada página nova de `AI Models` no app web, separada do shell de chat
- criada API própria para leitura/escrita de modelos do OpenClaw
- catálogo de modelos passa a ler o runtime real do `openclaw`
- seleção de provider/model default e teste real de runtime disponíveis na UI
- rota `/?path=~ai-models` redireciona para a página dedicada

Arquivos principais:
- [apps/web/app/api/settings/ai-models/route.ts](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/app/api/settings/ai-models/route.ts)
- [apps/web/app/components/settings/ai-models-panel.tsx](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/app/components/settings/ai-models-panel.tsx)
- [apps/web/app/settings/ai-models/page.tsx](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/app/settings/ai-models/page.tsx)
- [apps/web/app/settings/ai-models/ai-models-shell.tsx](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/app/settings/ai-models/ai-models-shell.tsx)
- [apps/web/lib/ai-models-settings.ts](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/lib/ai-models-settings.ts)

### Composio migrada do gateway Dench para backend oficial
- a tela de `Integrations` deixou de depender do gateway `gateway.merseoriginals.com` para catálogo e connect da Composio
- integração agora usa a API oficial `backend.composio.dev/api/v3` com `x-api-key`
- criada store local de Composio em `~/.openclaw-dench/composio-profiles.json`
- `connect`, `connections`, `toolkits` e persistência da key passam a seguir o padrão do app desktop de referência
- healthcheck da Composio foi adaptado para não acusar erro falso quando a key é `ak_...`
- a key válida encontrada no app `Agents Dev` foi sincronizada para o estado do `DenchClaw`

Arquivos principais:
- [apps/web/lib/composio.ts](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/lib/composio.ts)
- [apps/web/lib/composio-mcp-health.ts](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/lib/composio-mcp-health.ts)
- [apps/web/app/api/composio/connect/route.ts](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/app/api/composio/connect/route.ts)
- [apps/web/app/api/composio/connections/route.ts](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/app/api/composio/connections/route.ts)
- [apps/web/app/api/composio/disconnect/route.ts](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/app/api/composio/disconnect/route.ts)
- [apps/web/app/api/composio/toolkits/route.ts](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/app/api/composio/toolkits/route.ts)
- [apps/web/app/components/integrations/composio-apps-section.tsx](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/app/components/integrations/composio-apps-section.tsx)
- [apps/web/app/components/integrations/integrations-panel.tsx](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/app/components/integrations/integrations-panel.tsx)

### Ajustes de navegação e shell
- sidebar do workspace expandida para `Cloud`, `AI Models`, `Integrations`, `Skills` e `Cron`
- página principal e shell do workspace ajustados para suportar telas dedicadas de settings
- service worker web adicionado ao app

Arquivos principais:
- [apps/web/app/components/workspace/workspace-sidebar.tsx](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/app/components/workspace/workspace-sidebar.tsx)
- [apps/web/app/page.tsx](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/app/page.tsx)
- [apps/web/app/workspace/workspace-content.tsx](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/app/workspace/workspace-content.tsx)
- [apps/web/public/sw.js](/Users/guilhermevarela/Documents/Projetos/DenchClaw/apps/web/public/sw.js)

## Histórico do fork

### Base Dench Cloud
- bootstrap e sync de `Dench Cloud`
- centralização da chave da Dench Cloud
- integração do gateway com OpenClaw
- normalização de allowlists e plugins do runtime web/CLI

Indicadores no histórico:
- `bootstrap-dench-cloud-sync`
- `streamline-dench-api-key`
- `enable multi-provider gateway support`

### Workspace web com settings unificado
- criação do plano de settings dentro do workspace web
- seções dedicadas para `Cloud`, `Integrations`, `Skills` e `Cron`
- renderização imediata de tabs não-chat e correções de hidratação

Indicadores no histórico:
- `feat(web): add unified settings workspace plane`
- `feat(web): add integrations workspace plane`
- `feat(web): add dench cloud settings tab`

### Skill Store no app web
- navegação de skills instaladas
- browse de skills externas
- one-click install via ClawHub / skills.sh
- remoção do fluxo legado de skills

Indicadores no histórico:
- `feat(web): one-click skill install from ClawHub`
- `feat(web): browse ClawHub skills tab`
- `Migrate skill store to skills.sh`

### Integrations Dench
- toggles e health state para `Exa`, `Apollo` e `ElevenLabs`
- modelo de lock por credencial/configuração
- reparo automático de perfis antigos
- sincronização do runtime após mutações

Indicadores no histórico:
- `feat(web): add integrations state read model`
- `feat(web): add Exa toggle with duckduckgo fallback`
- `feat(web): add Apollo and ElevenLabs integration toggles`
- `feat(web): add repair flow for older Dench integration profiles`

### Composio no web
- catálogo e connected apps
- callback OAuth, disconnect e branding de toolkit
- ações inline da Composio no chat
- índices e tool UX no workspace
- fase inicial via gateway da Dench
- fase atual migrada para backend oficial da Composio

Indicadores no histórico:
- `feat(web): add Connected Apps UI with Composio catalog, search, and OAuth flow`
- `feat(composio): web API`
- `feat(composio): web UI`
- `feat(composio): gateway-only discovery`
- `Unreleased` deste arquivo

### Chat, runtime e voice
- retomada de chats após desconexão do gateway
- melhorias no tratamento de empty response
- multimodal com upload nativo
- ajustes de voice routes e integração ElevenLabs

Indicadores no histórico:
- `fix(chat): improve empty response detection logic`
- `fix(chat): send image attachments as base64`
- `feat(voice): implement ElevenLabs voice selection and playback features`

## Estado atual importante

### Chaves e stores locais
- OpenClaw state: [~/.openclaw-dench/openclaw.json](/Users/guilhermevarela/.openclaw-dench/openclaw.json)
- Composio local do DenchClaw: [~/.openclaw-dench/composio-profiles.json](/Users/guilhermevarela/.openclaw-dench/composio-profiles.json)
- Referência externa usada para resgate da key: [~/Library/Application Support/Agents Dev/composio-profiles.json](/Users/guilhermevarela/Library/Application%20Support/Agents%20Dev/composio-profiles.json)

### Pendências conhecidas
- o shell principal ainda gera ruído separado de `chat/stream 404` em alguns caminhos do workspace
- a tela de `AI Models` ainda precisa de paridade visual mais exata com o app de referência
- o fluxo de OAuth de alguns providers do `AI Models` no web ainda não replica o comportamento do Electron

## Como manter

Quando houver mudança relevante:
- atualizar `Unreleased`
- citar os arquivos centrais
- mover blocos estáveis para `Histórico do fork` quando a feature consolidar
- registrar mudança de backend/protocolo sempre que existir migração silenciosa como aconteceu com Composio
