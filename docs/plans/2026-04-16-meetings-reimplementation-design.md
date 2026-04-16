# Reimplementacao de Notes + Meetings no Next App

Data: 2026-04-16

## Objetivo

Reimplementar no `apps/web` o fluxo de meetings descrito no baseline do Surf, preservando os comportamentos criticos:

- gravacao e importacao de audio
- criacao antecipada da note
- transcricao com Deepgram
- embelezamento e titulo com OpenRouter
- persistencia separada de meeting, audio e transcript
- listagem de meetings
- visualizacao do audio e da transcricao bruta
- erro auditavel dentro da propria note

## Decisoes aprovadas

- Persistencia via `object entries`, nao notebook virtual em arquivos soltos
- Tres objetos de primeira classe:
  - `meetings`
  - `meeting_audio_assets`
  - `meeting_transcripts`
- Payload pesado em disco:
  - audio em `meetings/audio/...`
  - transcript artifact JSON em `meetings/transcripts/...`
- `Deepgram` para STT
- `OpenRouter` para beautify e geracao de titulo

## Arquitetura

## Modelo de dados

### meetings

Campos principais:

- `Title`
- `Session ID`
- `Status`
- `Source`
- `Duration Seconds`
- `Language`
- `Filename`
- `Has Transcript`
- `Audio Asset`
- `Transcript Asset`
- `Raw Transcript Fallback`
- `Error Message`
- `Started At`
- `Ended At`

O conteudo principal da meeting note sera salvo no documento Markdown associado a entry usando a infraestrutura existente de `entries/[id]/content`.

### meeting_audio_assets

Campos principais:

- `Title`
- `Session ID`
- `Source`
- `Duration Seconds`
- `Mime Type`
- `Original Filename`
- `File Path`
- `File Size Bytes`
- `Parent Meeting`

### meeting_transcripts

Campos principais:

- `Title`
- `Session ID`
- `Source`
- `Language`
- `Provider`
- `Model`
- `Raw Text`
- `Artifact Path`
- `Parent Meeting`
- `Started At`
- `Ended At`

O artifact JSON seguira a estrutura funcional do baseline e sera salvo no disco, com metadados duplicados no object para busca e UX.

## Backend

Sera criado um modulo server-side em `apps/web/lib/meetings.ts` com responsabilidades:

- bootstrap idempotente do schema dos 3 objects
- criacao de entries e vinculacoes
- persistencia de audio e transcript artifact
- geracao do template final da note
- helpers de status, session id e fallback de erro

Novas rotas em `apps/web/app/api/meetings`:

- `POST /api/meetings/finalize`
  - aceita upload/import de audio
  - cria audio asset
  - cria meeting placeholder
  - transcreve
  - embeleza
  - gera titulo
  - cria transcript asset
  - atualiza a note final
- `GET /api/meetings/list`
  - lista meetings recentes
- `GET /api/meetings/[id]/raw-transcript`
  - resolve transcript bruto priorizando transcript asset

Live transcription Deepgram-like nao entra completa nesta primeira entrega. A V1 implementa degradacao explicita para pos-stop/import, sem quebrar a UX.

## Frontend

### Pagina de meetings

Nova rota dedicada `apps/web/app/meetings/page.tsx` com:

- botao `Start Recording`
- botao `Import Audio`
- estados `idle`, `recording`, `processing`, `transcribing`, `beautifying`, `creating`, `finalizing`, `error`
- lista de meetings recentes
- navegacao para a note criada usando a shell existente do workspace

### Visualizacao da meeting note

A meeting continuara sendo uma entry do workspace, mas a UX sera enriquecida no `EntryDetailPanel` quando `objectName === "meetings"`:

- botao `Raw Transcript`
- player de audio acima do documento
- bloco de detalhes da reuniao
- modal de transcript bruto com copiar

O documento Markdown salvo para a note final tera:

1. cabecalho de audio em markdown com link do asset
2. corpo embelezado
3. separador
4. bloco markdown de detalhes
5. secao markdown de transcript bruto

Mesmo quando o renderer markdown nao suportar HTML rico, a informacao continua persistida e visivel.

## Fluxo funcional

1. usuario grava ou importa audio
2. backend salva audio em disco
3. backend cria `meeting_audio_asset`
4. backend cria `meeting` placeholder com status inicial
5. note da meeting e aberta imediatamente
6. backend chama Deepgram
7. backend salva `meeting_transcript` + artifact JSON
8. backend chama OpenRouter para beautify
9. backend chama OpenRouter para titulo curto
10. backend atualiza a meeting note e marca `ready`

Em falha:

- placeholder permanece persistido
- status vira `error`
- bloco de erro entra no documento
- transcript parcial ou bruto entra como fallback se existir

## Testes

Implementacao guiada por testes:

- helper de template final
- bootstrap idempotente do schema
- fluxo de placeholder antes do pipeline terminar
- persistencia separada dos 3 recursos
- fallback de erro auditavel
- rotas `finalize`, `list` e `raw-transcript`
- renderer de painel da meeting com audio e transcript bruto

## Fora de escopo da primeira entrega

- live transcript Deepgram via WebSocket
- chunking de arquivos muito grandes
- streaming de progresso fino por SSE
- notebook virtual dentro da tree principal do workspace
